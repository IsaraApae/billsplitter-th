// Shared data model. Money is always integer minor units; rates are basis points
// (1% = 100 bp) so no floating point touches a stored value.

export type SplitMode = "equal" | "itemized";

export const PERSON_COLORS = ["emerald", "sky", "violet", "rose", "amber", "teal", "indigo", "slate"] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];

export interface Person {
  id: string;
  name: string;
  emoji?: string;
  color?: PersonColor;
}

export interface Item {
  id: string;
  name: string;
  qty: number; // positive integer
  price: number; // unit price, minor units
  assigned: string[]; // person ids (itemized mode)
  /** Uneven split: how many shares each assigned person had (e.g. 2 of 3 beers). Absent / missing = 1. */
  shares?: Record<string, number>;
}

export interface Discount {
  enabled: boolean;
  type: "percent" | "fixed";
  /** bp when type = percent, minor units when type = fixed */
  value: number;
  scope: "all" | "selected";
  itemIds: string[];
}

/** Part of the bill a friend paid themselves (e.g. the drinks), in minor units. */
export interface Prepaid {
  personId: string;
  amount: number;
  /** their PromptPay, so friends can pay them directly (settle = "direct") */
  promptpay?: string;
}

/**
 * When several people paid at the restaurant: everyone pays the organiser,
 * who pays the others back ("organiser", the default), or friends pay each
 * payer directly ("direct").
 */
export type SettleMode = "organiser" | "direct";

export interface Rate {
  enabled: boolean;
  rateBp: number;
  /**
   * The amount exactly as printed on the scanned receipt (restaurants often
   * round it). Used instead of the percentage while the discounted subtotal
   * is still `base`, i.e. until the items change.
   */
  amount?: number;
  base?: number;
}

/** A receipt's own rounding line ("Rounding", "ปัดเศษ"), kept while the subtotal is still `base`. */
export interface ReceiptRounding {
  amount: number;
  base: number;
}

/**
 * How the creator gets paid.
 * - "generate": build a PromptPay QR from `promptpay` with each person's exact amount
 * - "upload": show the creator's uploaded QR image (looked up live via `ownerId`)
 * - "none": no QR, just the note
 * Older splits have no `qrMode`; they behave like "generate" when `promptpay` is set.
 */
export type QrMode = "none" | "upload" | "generate";

export interface PaymentInfo {
  promptpay: string; // phone / national ID / e-wallet id, digits only
  note: string; // free text, e.g. bank + account
  qrMode?: QrMode;
  ownerId?: string; // creator's device profile id (for the uploaded QR)
  /** name on the organiser's bank account, to check who a slip was paid to */
  slipName?: string;
}

/** Figures printed on a scanned receipt, used only for mismatch warnings. */
export interface ReceiptTotals {
  subtotal: number | null;
  total: number | null;
}

export interface SplitDoc {
  v: 1;
  title: string;
  createdAt: string; // ISO
  /** Day of the meal, YYYY-MM-DD, when the user picked one; else createdAt's day. */
  date?: string;
  currency: string;
  mode: SplitMode;
  people: Person[];
  items: Item[];
  discount: Discount;
  service: Rate;
  vat: Rate;
  payment: PaymentInfo;
  receipt: ReceiptTotals;
  /** Round each share up to the nearest whole unit (฿1). Absent = off. */
  roundUp?: boolean;
  /** Friends who paid part of the bill themselves; the organiser paid the rest. */
  prepaid?: Prepaid[];
  /** How money moves when friends paid part of the bill too. Absent = "organiser". */
  settle?: SettleMode;
  /** The receipt's printed rounding adjustment, if it had one. */
  receiptRounding?: ReceiptRounding;
  /** Stored receipt photo (see /api/receipt), shown on the shared page. */
  photo?: string;
}
