import "server-only";
import { calculate, ORGANISER_ID, type CalcResult } from "../calc";
import { findTransfer, payerPromptPay, settlesDirectly } from "../settle";
import { slipMatches, type SlipCheck, type SlipRead } from "../slip";
import type { SplitDoc } from "../types";
import { deleteImages, storeReceiptImage } from "./qrStore";
import { readSlip, type SlipForm } from "./slipRead";

type Fail = { ok: false; status: number; code: string; message: string };

/**
 * What a slip for `ref` (a person id, or a transfer key when friends pay
 * each payer directly) should cover in this split, and who it should have
 * been paid to.
 */
export function slipTarget(
  doc: SplitDoc,
  ref: string,
  calc: CalcResult = calculate(doc),
): { ok: true; owed: number; payee: { promptpay?: string } } | Fail {
  if (settlesDirectly(doc)) {
    const t = findTransfer(doc, ref, calc);
    if (!t) return { ok: false, status: 404, code: "not_found", message: "That payment isn't in this split." };
    return { ok: true, owed: t.amount, payee: { promptpay: t.to === ORGANISER_ID ? doc.payment.promptpay : payerPromptPay(doc, t.to) } };
  }
  const r = calc.people.find((p) => p.personId === ref);
  if (!r || ref === ORGANISER_ID) return { ok: false, status: 404, code: "not_found", message: "That person isn't in this split." };
  return { ok: true, owed: r.payable, payee: { promptpay: doc.payment.promptpay } };
}

/**
 * Reads the slip and, at the same time, saves its picture (so the organiser
 * can look at it later) — the two together take about as long as the read.
 * `discard` removes the picture again when the slip isn't used.
 * `expect` (the route's checkSlip options and what's still owed) lets a quick
 * Flash-Lite read through when it passes those checks and shows exactly that amount.
 */
export async function readAndKeep(
  form: Extract<SlipForm, { ok: true }>,
  expect?: { check: SlipCheck; owed: number },
): Promise<({ ok: true; slip: SlipRead; photo: Promise<string> } | Fail) & { discard: () => void }> {
  const photo = storeReceiptImage(form.bytes, "slips").catch(() => "");
  const discard = () =>
    void photo.then(async (url) => {
      if (url) await deleteImages([url]).catch(() => {});
    });
  const r = await readSlip(form.bytes, form.mime, expect && ((slip) => slipMatches(slip, expect.check, expect.owed)));
  if (!r.ok) {
    discard();
    return { ...r, discard };
  }
  return { ok: true, slip: r.slip, photo, discard };
}
