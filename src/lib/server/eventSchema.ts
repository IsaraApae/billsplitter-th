import "server-only";
import { z } from "zod";

const splitRef = z.object({ id: z.string().regex(/^[\w-]{16}$/), token: z.string().max(100).optional() });

/** Body of creating or editing a big bill. */
export const eventBody = z.object({
  title: z.string().trim().max(80).default(""),
  date: z.iso.date(),
  splits: z
    .array(splitRef)
    .min(1)
    .max(20)
    .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, "A bill is listed twice"),
});
