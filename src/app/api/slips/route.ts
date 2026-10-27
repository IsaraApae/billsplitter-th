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
 * One slip for several bills owed to the same person ("What I owe" → Pay):
 * multipart image + items = JSON [{ id, ref }] (ref: who I am in that bill,
 * or the transfer key). Checked against the first bill's payee, then spread
 * over the bills oldest first (only bills dated on or before the slip).
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "scan");
  if (limited) return limited;
  return safely(async () => {
    const form = await readSlipForm(req, "items", 4_000);
    if (!form.ok) return jsonError(form.status, form.code, form.message);
    let items: { id: string; ref: string }[];
    try {
      const raw = JSON.parse(form.personRef) as unknown;
      items = (Array.isArray(raw) ? raw : [])
        .filter((x): x is { id: string; ref: string } => !!x && typeof x.id === "string" && isValidId(x.id) && typeof x.ref === "string" && x.ref.length <= 100)
        .slice(0, 30);
    } catch {
      items = [];
    }
    if (items.length === 0) return jsonError(400, "bad_request", "Say which bills this slip is for.");

    // What's still owed on each bill.
    const bills = (
      await Promise.all(
        items.map(async ({ id, ref }) => {
          const s = await getSplit(id);
          if (!s) return null;
          const target = slipTarget(s.doc, ref, calculate(s.doc));
          if (!target.ok) return null;
          const state = await getPaidState(id, s.doc);
          const partial = state.partial[ref] ?? 0;
          const left = state.paid.includes(ref) ? 0 : target.owed - partial;
          return left > 0 ? { id, ref, doc: s.doc, payee: target.payee, partial, left, day: billDay(s.doc) } : null;
        }),
      )
    )
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.day.localeCompare(b.day));
    if (bills.length === 0) return jsonError(409, "nothing_owed", "These bills are already paid.");

    const check = { billDay: bills[0].day, currency: bills[0].doc.currency, organiser: bills[0].payee };
    const read = await readAndKeep(form, { check, owed: bills.reduce((sum, b) => sum + b.left, 0) });
    if (!read.ok) return jsonError(read.status, read.code, read.message);
    const verdict = checkSlip(read.slip, check);
    if (!verdict.ok) {
      read.discard();
      return jsonError(422, "slip_rejected", verdict.reason);
    }
    if (!(await claimSlipReference(verdict.reference, `m:${bills[0].id}:${bills[0].ref}`))) {
      read.discard();
      return jsonError(409, "slip_used", "This slip has already been used.");
    }

    // Spread the amount, oldest bill first (a slip can't pay a bill dated after it).
    let money = verdict.amount;
    const applied: { id: string; amount: number; full: boolean }[] = [];
    for (const b of bills) {
      if (money <= 0 || b.day > (read.slip.date ?? "")) continue;
      const pay = Math.min(money, b.left);
      money -= pay;
      const full = pay >= b.left;
      await recordCheckedPayment(b.id, b.ref, full ? { kind: "full" } : { kind: "part", amount: b.partial + pay });
      applied.push({ id: b.id, amount: pay, full });
    }
    const photo = await read.photo;
    await Promise.all(
      applied.map((a) =>
        addSlip(a.id, bills.find((b) => b.id === a.id)!.ref, {
          photo,
          amount: a.amount,
          date: read.slip.date!,
          reference: verdict.reference,
          receiver: verdict.receiver,
          senderName: read.slip.senderName,
          at: new Date().toISOString(),
        }),
      ),
    );
    const left = bills.reduce((s, b) => s + b.left, 0) - applied.reduce((s, a) => s + a.amount, 0);
    return Response.json({
      result: left <= 0 ? "full" : "part",
      amount: verdict.amount,
      left: Math.max(0, left),
      receiver: verdict.receiver,
      applied,
    });
  });
}
