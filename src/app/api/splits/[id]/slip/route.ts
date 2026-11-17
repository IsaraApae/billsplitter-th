import { calculate } from "@/lib/calc";
import { billDay } from "@/lib/draft";
import { formatMoney } from "@/lib/money";
import { checkSlip, fitsShare, slack } from "@/lib/slip";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { addCheckedPayment, addSlip, claimSlipReference, getPaidState, getSlips, getSplit, isValidId, slipRefs } from "@/lib/server/redis";
import { readAndKeep, slipRecord, slipTarget } from "@/lib/server/slipPay";
import { readSlipForm } from "@/lib/server/slipRead";

export const maxDuration = 60;

/**
 * A friend uploads their transfer slip (multipart: image, personId — or a
 * transfer key when friends pay each payer directly). If it checks out — a
 * real-looking slip, dated on or after the bill, paid to the right person as
 * far as can be told, never used before — they're ticked: the big tick if it
 * covers what's left, otherwise the small tick. Someone the organiser already ticked
 * paid can still send theirs: it's kept (result "recorded") so Who pays fastest counts
 * from when the money was sent, if it's for what they owed on this bill.
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
    if (target.owed <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this split.");
    // Already ticked paid: a slip only adds when the money was sent, unless their slips show that already.
    const ticked = state.paid.includes(ref);
    const shown = ticked ? ((await getSlips(id))[ref] ?? []).reduce((sum, x) => sum + x.amount, 0) : 0;
    if (ticked && shown >= target.owed - slack(target.owed)) {
      return jsonError(409, "already_paid", "You're marked as paid, and your slip is already saved.");
    }

    const check = { billDay: billDay(s.doc), currency: s.doc.currency, organiser: target.payee };
    const read = await readAndKeep(form, { check, owed: ticked ? target.owed - shown : target.owed - (state.partial[ref] ?? 0) });
    if (!read.ok) return jsonError(read.status, read.code, read.message);
    const verdict = checkSlip(read.slip, check);
    if (!verdict.ok) {
      read.discard();
      return jsonError(422, "slip_rejected", verdict.reason);
    }
    // Kept only for its time, so it must be this payment (not one meant for another bill, which
    // would then be refused there as already used).
    if (ticked && !fitsShare(verdict.amount, target.owed - shown, target.owed)) {
      read.discard();
      return jsonError(
        422,
        "slip_rejected",
        `This slip is for ${formatMoney(verdict.amount, s.doc.currency)}, but this bill was ${formatMoney(target.owed, s.doc.currency)}. Is it for another bill?`,
      );
    }
    if (!(await claimSlipReference(verdict.reference, `${id}:${ref}`))) {
      read.discard();
      return jsonError(409, "slip_used", "This slip has already been used.");
    }
    if (ticked) {
      await addSlip(id, ref, await slipRecord(read, verdict, verdict.amount));
      return Response.json({ result: "recorded", amount: verdict.amount, left: 0, receiver: verdict.receiver, ...state, slipped: await slipRefs(id) });
    }

    // Added to what's stored now (not what was read before the slip), so two slips sent together both count.
    const next = await addCheckedPayment(id, ref, verdict.amount, target.owed);
    if (next === "not_found") return jsonError(404, "not_found", "That person isn't in this split.");
    await addSlip(id, ref, await slipRecord(read, verdict, verdict.amount));
    return Response.json({
      result: next.full ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, target.owed - next.paidSoFar),
      receiver: verdict.receiver,
      ...next.state,
      slipped: await slipRefs(id),
    });
  });
}
