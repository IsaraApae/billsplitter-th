import { billDay } from "@/lib/draft";
import { eventPeople } from "@/lib/event";
import { checkSlip } from "@/lib/slip";
import { jsonError, safely } from "@/lib/server/http";
import { storeReceiptImage } from "@/lib/server/qrStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { addSlip, claimSlipReference, getEvent, isValidId, recordCheckedEventPayment } from "@/lib/server/redis";
import { readSlipUpload } from "@/lib/server/slipRead";

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
    const e = await getEvent(id);
    if (!e) return jsonError(404, "not_found", "This big bill doesn't exist or has expired.");
    const upload = await readSlipUpload(req, "personKey");
    if (!upload.ok) return jsonError(upload.status, upload.code, upload.message);
    const person = eventPeople(e.bills).find((p) => p.key === upload.personRef);
    if (!person || person.organiser) return jsonError(404, "not_found", "That person isn't in this big bill.");
    if (person.status === "full") return jsonError(409, "already_paid", "You're already marked as paid.");
    if (person.total <= 0) return jsonError(409, "nothing_owed", "You don't owe anything on this big bill.");

    const theirBills = e.bills.filter((b) => person.bills.some((pb) => pb.splitId === b.id));
    const earliest = theirBills.map((b) => billDay(b.doc)).sort()[0];
    const newest = [...theirBills].sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))[0];
    const verdict = checkSlip(upload.slip, {
      billDay: earliest,
      currency: newest.doc.currency,
      organiser: { promptpay: newest.doc.payment.promptpay },
    });
    if (!verdict.ok) return jsonError(422, "slip_rejected", verdict.reason);
    if (!(await claimSlipReference(verdict.reference, `e:${id}:${person.key}`))) {
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    const photo = await storeReceiptImage(upload.bytes, "slips").catch(() => "");
    const paidSoFar = person.paidSoFar + verdict.amount;
    const full = paidSoFar >= person.total;
    const next = await recordCheckedEventPayment(id, person.key, full ? { kind: "full" } : { kind: "part", amount: paidSoFar });
    if (next === "not_found") return jsonError(404, "not_found", "That person isn't in this big bill.");
    // Kept with their first bill, where the organiser can see it.
    const first = person.bills[0];
    await addSlip(first.splitId, first.personId, {
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
      left: Math.max(0, person.total - paidSoFar),
      receiver: verdict.receiver,
      ...next,
    });
  });
}
