import { calculate } from "@/lib/calc";
import { billDay } from "@/lib/draft";
import { checkSlip } from "@/lib/slip";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { addSlip, claimSlipReference, getPaidState, getSplit, isValidId, recordCheckedPayment } from "@/lib/server/redis";
import { readAndKeep, slipTarget } from "@/lib/server/slipPay";
import { readSlipForm } from "@/lib/server/slipRead";

export const maxDuration = 60;

/**
 * A friend uploads their transfer slip (multipart: image, personId — or a
 * transfer key when friends pay each payer directly). If it checks out — a
 * real-looking slip, dated on or after the bill, paid to the right person as
 * far as can be told, never used before — they're ticked: the big tick if it
 * covers what's left, otherwise the small tick.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/splits/[id]/slip">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Split not found.");
  return safely(async () => {
    const [s, form] = await Promise.all([getSplit(id), readSlipForm(req, "personId")]);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    if (!form.ok) return jsonError(form.status, form.code, form.message);
    const ref = form.personRef;
    const target = slipTarget(s.doc, ref, calculate(s.doc));
    if (!target.ok) return jsonError(target.status, target.code, target.message);
    const state = await getPaidState(id, s.doc);
    if (state.paid.includes(ref)) return jsonError(409, "already_paid", "You're already marked as paid.");
    if (target.owed <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this split.");

    const check = { billDay: billDay(s.doc), currency: s.doc.currency, organiser: target.payee };
    const read = await readAndKeep(form, { check, owed: target.owed - (state.partial[ref] ?? 0) });
    if (!read.ok) return jsonError(read.status, read.code, read.message);
    const verdict = checkSlip(read.slip, check);
    if (!verdict.ok) {
      read.discard();
      return jsonError(422, "slip_rejected", verdict.reason);
    }
    if (!(await claimSlipReference(verdict.reference, `${id}:${ref}`))) {
      read.discard();
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    const paidSoFar = (state.partial[ref] ?? 0) + verdict.amount;
    const full = paidSoFar >= target.owed;
    const next = await recordCheckedPayment(id, ref, full ? { kind: "full" } : { kind: "part", amount: paidSoFar });
    if (next === "not_found") return jsonError(404, "not_found", "That person isn't in this split.");
    await addSlip(id, ref, {
      photo: await read.photo,
      amount: verdict.amount,
      date: read.slip.date!,
      reference: verdict.reference,
      receiver: verdict.receiver,
      senderName: read.slip.senderName,
      at: new Date().toISOString(),
    });
    return Response.json({
      result: full ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, target.owed - paidSoFar),
      receiver: verdict.receiver,
      ...next,
    });
  });
}
