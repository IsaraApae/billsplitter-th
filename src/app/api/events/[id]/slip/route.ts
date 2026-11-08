import { billDay } from "@/lib/draft";
import { eventPeople } from "@/lib/event";
import { checkSlip } from "@/lib/slip";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { addSlip, claimSlipReference, getEvent, isValidId, recordCheckedEventPayment } from "@/lib/server/redis";
import { readAndKeep, slipRecord } from "@/lib/server/slipPay";
import { readSlipForm } from "@/lib/server/slipRead";

export const maxDuration = 60;

/**
 * A friend uploads one slip for their whole big-bill total (multipart: image,
 * personKey). Checked like a single bill's slip, against the earliest of
 * their bills, then spread over their bills in order.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/events/[id]/slip">) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isValidId(id)) return jsonError(404, "not_found", "Big bill not found.");
  return safely(async () => {
    const [e, form] = await Promise.all([getEvent(id), readSlipForm(req, "personKey")]);
    if (!e) return jsonError(404, "not_found", "This big bill doesn't exist or has expired.");
    if (!form.ok) return jsonError(form.status, form.code, form.message);
    const person = eventPeople(e.bills).find((p) => p.key === form.personRef);
    if (!person || person.organiser) return jsonError(404, "not_found", "That person isn't in this big bill.");
    if (person.status === "full") return jsonError(409, "already_paid", "You're already marked as paid.");
    if (person.total <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this big bill.");

    const theirBills = e.bills.filter((b) => person.bills.some((pb) => pb.splitId === b.id));
    const earliest = theirBills.map((b) => billDay(b.doc)).sort()[0];
    const newest = [...theirBills].sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))[0];
    const check = { billDay: earliest, currency: newest.doc.currency, organiser: { promptpay: newest.doc.payment.promptpay } };
    const read = await readAndKeep(form, { check, owed: person.total - person.paidSoFar });
    if (!read.ok) return jsonError(read.status, read.code, read.message);
    const verdict = checkSlip(read.slip, check);
    if (!verdict.ok) {
      read.discard();
      return jsonError(422, "slip_rejected", verdict.reason);
    }
    if (!(await claimSlipReference(verdict.reference, `e:${id}:${person.key}`))) {
      read.discard();
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    // Reading the slip takes a while; start from what's paid now, so a slip that landed in
    // the meantime isn't overwritten.
    const now = await getEvent(id);
    const fresh = now && eventPeople(now.bills).find((p) => p.key === person.key);
    if (!fresh) return jsonError(404, "not_found", "That person isn't in this big bill.");
    const paidSoFar = (fresh.status === "full" ? fresh.total : fresh.paidSoFar) + verdict.amount;
    const full = paidSoFar >= fresh.total;
    const next = await recordCheckedEventPayment(id, person.key, full ? { kind: "full" } : { kind: "part", amount: paidSoFar });
    if (next === "not_found") return jsonError(404, "not_found", "That person isn't in this big bill.");
    // Kept with their first bill, where the organiser can see it.
    const first = person.bills[0];
    await addSlip(first.splitId, first.personId, await slipRecord(read, verdict, verdict.amount));
    return Response.json({
      result: full ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, fresh.total - paidSoFar),
      receiver: verdict.receiver,
      ...next,
    });
  });
}
