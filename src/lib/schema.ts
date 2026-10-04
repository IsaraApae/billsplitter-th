import { z } from "zod";
import { CURRENCIES } from "./money";
import { PERSON_COLORS, type SplitDoc } from "./types";

const id = z.string().min(1).max(40).regex(/^[\w-]+$/);
const name = z.string().trim().min(1).max(80);
const money = z.number().int().min(0).max(1_000_000_000_00);
const bp = z.number().int().min(0).max(10000);

export const splitDocSchema = z
  .object({
    v: z.literal(1),
    title: z.string().trim().max(80).default(""),
    createdAt: z.iso.datetime(),
    currency: z.enum(CURRENCIES),
    mode: z.enum(["equal", "itemized"]),
    people: z
      .array(
        z.object({
          id,
          name,
          emoji: z.string().max(16).optional(),
          color: z.enum(PERSON_COLORS).optional(),
        }),
      )
      .min(1)
      .max(50),
    items: z
      .array(
        z.object({
          id,
          name,
          qty: z.number().int().min(1).max(999),
          price: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00), // negative = discount on one item
          assigned: z.array(id).max(50),
        }),
      )
      .min(1)
      .max(300),
    discount: z.object({
      enabled: z.boolean(),
      type: z.enum(["percent", "fixed"]),
      value: money,
      scope: z.enum(["all", "selected"]),
      itemIds: z.array(id).max(300),
    }),
    service: z.object({ enabled: z.boolean(), rateBp: bp }),
    vat: z.object({ enabled: z.boolean(), rateBp: bp }),
    payment: z.object({
      promptpay: z.string().regex(/^\d{0,15}$/).default(""),
      note: z.string().max(300).default(""),
      qrMode: z.enum(["none", "upload", "generate"]).optional(),
      ownerId: z.string().regex(/^[\w-]{16}$/).optional(),
    }),
    receipt: z.object({ subtotal: money.nullable(), total: money.nullable() }),
    roundUp: z.boolean().optional(),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set(doc.people.map((p) => p.id));
    if (ids.size !== doc.people.length) ctx.addIssue({ code: "custom", message: "Duplicate person id" });
    if (doc.discount.type === "percent" && doc.discount.value > 10000)
      ctx.addIssue({ code: "custom", message: "Discount over 100%" });
    if (doc.mode === "itemized") {
      for (const it of doc.items) {
        if (!it.assigned.some((a) => ids.has(a)))
          ctx.addIssue({ code: "custom", message: `Item "${it.name}" is not assigned to anyone` });
      }
    }
  });

/** Validates and normalises a split (drops dangling person references). */
export function parseSplitDoc(input: unknown): { ok: true; doc: SplitDoc } | { ok: false; error: string } {
  const r = splitDocSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `${first.path.join(".") || "split"}: ${first.message}` };
  }
  const doc = r.data as SplitDoc;
  const ids = new Set(doc.people.map((p) => p.id));
  const itemIds = new Set(doc.items.map((i) => i.id));
  doc.items = doc.items.map((it) => ({ ...it, assigned: [...new Set(it.assigned)].filter((a) => ids.has(a)) }));
  doc.discount.itemIds = doc.discount.itemIds.filter((i) => itemIds.has(i));
  return { ok: true, doc };
}
