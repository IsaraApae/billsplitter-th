import { calculate, ORGANISER_ID } from "@/lib/calc";
import { billDay } from "@/lib/draft";
import { eventPeople } from "@/lib/event";
import { checkSlip } from "@/lib/slip";
import { jsonError, readJson, safely } from "@/lib/server/http";
import { deleteQrImage, storeReceiptImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import {
  addSlip,
  canEditSplit,
  claimSlipReference,
  getEvent,
  getPaidState,
  getSlips,
  getSplit,
  isValidId,
  newUndo,
  recordCheckedEventPayment,
  recordCheckedPayment,
  removeSlip,
  undoMatches,
} from "@/lib/server/redis";
import { readSlipUpload } from "@/lib/server/slipRead";

export const maxDuration = 60;

/**
 * A friend uploads their transfer slip (multipart: image, personId). If it
 * checks out — a real-looking slip, dated on or after the bill, paid to the
 * organiser as far as can be told, never used before — they're ticked:
 * the big tick if it covers what's left, otherwise the small tick.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/splits/[id]/slip">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const s = await getSplit(id);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const upload = await readSlipUpload(req, "personId");
    if (!upload.ok) return jsonError(upload.status, upload.code, upload.message);
    const personId = upload.personRef;
    const i = s.doc.people.findIndex((p) => p.id === personId);
    if (i < 0 || personId === ORGANISER_ID) return jsonError(404, "not_found", "That person isn't in this split.");

    const owed = calculate(s.doc).people[i].payable;
    const state = await getPaidState(id, s.doc);
    if (state.paid.includes(personId)) return jsonError(409, "already_paid", "You're already marked as paid.");
    if (owed <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this split.");

    const verdict = checkSlip(upload.slip, {
      billDay: billDay(s.doc),
      currency: s.doc.currency,
      organiser: { slipName: s.doc.payment.slipName, promptpay: s.doc.payment.promptpay },
    });
    if (!verdict.ok) return jsonError(422, "slip_rejected", verdict.reason);
    if (!(await claimSlipReference(verdict.reference, `${id}:${personId}`))) {
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    const photo = await storeReceiptImage(upload.bytes, "slips").catch(() => "");
    const undo = newUndo();
    const paidSoFar = (state.partial[personId] ?? 0) + verdict.amount;
    const full = paidSoFar >= owed;
    const next = await recordCheckedPayment(id, personId, full ? { kind: "full" } : { kind: "part", amount: paidSoFar });
    if (next === "not_found") return jsonError(404, "not_found", "That person isn't in this split.");
    await addSlip(id, personId, {
      photo,
      amount: verdict.amount,
      date: upload.slip.date!,
      reference: verdict.reference,
      receiver: verdict.receiver,
      senderName: upload.slip.senderName,
      at: new Date().toISOString(),
      undoHash: undo.hash,
    });
    return Response.json({
      result: full ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, owed - paidSoFar),
      receiver: verdict.receiver,
      reference: verdict.reference,
      // Lets the uploader remove this slip later (kept on their phone).
      undoToken: undo.token,
      ...next,
    });
  });
}

/**
 * Removes an uploaded slip (body: { personId, reference, undoToken? }) — by
 * the organiser (edit token) or by whoever uploaded it (their undo token).
 * Its amount comes off what that person has paid, and the slip can be
 * uploaded again.
 */
export async function DELETE(req: Request, ctx: RouteContext<"/api/splits/[id]/slip">) {
  const limited = await rateLimit(req, "write");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const body = (await readJson(req, 2_000)) as { personId?: unknown; reference?: unknown; undoToken?: unknown } | undefined;
    if (!body || typeof body.personId !== "string" || typeof body.reference !== "string") {
      return jsonError(400, "bad_request", "Invalid request.");
    }
    const s = await getSplit(id);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const slip = (await getSlips(id))[body.personId]?.find((x) => x.reference === body.reference);
    if (!slip) return jsonError(404, "not_found", "That slip isn't here any more.");
    const token = req.headers.get("x-edit-token");
    const allowed =
      (await canEditSplit(id, token && token.length <= 100 ? token : null)) ||
      (typeof body.undoToken === "string" && body.undoToken.length <= 100 && undoMatches(body.undoToken, slip.undoHash));
    if (!allowed) return jsonError(403, "forbidden", "Only the organiser or whoever uploaded it can remove this slip.");

    await removeSlip(id, body.personId, body.reference);
    await deleteQrImage(slip.photo || null);

    // Take the slip's amount back off what they've paid.
    if (slip.eventId && slip.personKey) {
      const e = await getEvent(slip.eventId);
      const person = e && eventPeople(e.bills).find((p) => p.key === slip.personKey);
      if (person) {
        const left = Math.max(0, person.paidSoFar - slip.amount);
        await recordCheckedEventPayment(slip.eventId, person.key, left > 0 ? { kind: "part", amount: left } : { kind: "none" });
      }
    } else {
      const i = s.doc.people.findIndex((p) => p.id === body.personId);
      if (i >= 0) {
        const owed = calculate(s.doc).people[i].payable;
        const state = await getPaidState(id, s.doc);
        const before = state.paid.includes(body.personId) ? owed : (state.partial[body.personId] ?? 0);
        const left = Math.max(0, before - slip.amount);
        await recordCheckedPayment(
          id,
          body.personId,
          left >= owed && left > 0 ? { kind: "full" } : left > 0 ? { kind: "part", amount: left } : { kind: "none" },
        );
      }
    }
    return Response.json(await getPaidState(id, s.doc));
  });
}
