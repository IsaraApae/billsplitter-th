// Shared data model. Money is always integer minor units; rates are basis points
// (1% = 100 bp) so no floating point touches a stored value.

export type SplitMode = "equal" | "itemized";

export interface Person {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  name: string;
  qty: number; // positive integer
  price: number; // unit price, minor units
  assigned: string[]; // person ids (itemized mode)
}

export interface Discount {
  enabled: boolean;
  type: "percent" | "fixed";
  /** bp when type = percent, minor units when type = fixed */
  value: number;
  scope: "all" | "selected";
  itemIds: string[];
}

export interface Rate {
  enabled: boolean;
  rateBp: number;
}

export interface PaymentInfo {
  promptpay: string; // phone / national ID / e-wallet id, digits only
  note: string; // free text, e.g. bank + account
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
  currency: string;
  mode: SplitMode;
  people: Person[];
  items: Item[];
  discount: Discount;
  service: Rate;
  vat: Rate;
  payment: PaymentInfo;
  receipt: ReceiptTotals;
}
