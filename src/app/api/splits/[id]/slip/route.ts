import { calculate, ORGANISER_ID } from "@/lib/calc";
import { billDay } from "@/lib/draft";
import { findTransfer, payerPromptPay, settlesDirectly } from "@/lib/settle";
import { checkSlip } from "@/lib/slip";
import { jsonError, safely } from "@/lib/server/http";
import { storeReceiptImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import {
  addSlip,
  claimSlipReference,
  getPaidState,
  getSplit,
  isValidId,
  recordCheckedPayment,
} from "@/lib/server/redis";
import { readSlipUpload } from "@/lib/server/slipRead";

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
    const s = await getSplit(id);
    if (!s) return jsonError(404, "not_found", "This split doesn't exist or has expired.");
    const upload = await readSlipUpload(req, "personId");
    if (!upload.ok) return jsonError(upload.status, upload.code, upload.message);
    const personId = upload.personRef;
    const calc = calculate(s.doc);
    let owed: number;
    // Who the money should have gone to.
    let payee: { promptpay?: string } = { promptpay: s.doc.payment.promptpay };
    if (settlesDirectly(s.doc)) {
      const t = findTransfer(s.doc, personId, calc);
      if (!t) return jsonError(404, "not_found", "That payment isn't in this split.");
      owed = t.amount;
      if (t.to !== ORGANISER_ID) payee = { promptpay: payerPromptPay(s.doc, t.to) };
    } else {
      const i = s.doc.people.findIndex((p) => p.id === personId);
      if (i < 0 || personId === ORGANISER_ID) return jsonError(404, "not_found", "That person isn't in this split.");
      owed = calc.people[i].payable;
    }
    const state = await getPaidState(id, s.doc);
    if (state.paid.includes(personId)) return jsonError(409, "already_paid", "You're already marked as paid.");
    if (owed <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this split.");

    const verdict = checkSlip(upload.slip, {
      billDay: billDay(s.doc),
      currency: s.doc.currency,
      organiser: payee,
    });
    if (!verdict.ok) return jsonError(422, "slip_rejected", verdict.reason);
    if (!(await claimSlipReference(verdict.reference, `${id}:${personId}`))) {
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    const photo = await storeReceiptImage(upload.bytes, "slips").catch(() => "");
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
    });
    return Response.json({
      result: full ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, owed - paidSoFar),
      receiver: verdict.receiver,
      ...next,
    });
  });
}
