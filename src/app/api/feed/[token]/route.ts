import { calculate, ORGANISER_ID } from "@/lib/calc";
import { jsonError, safely } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { feedOwner, recentOwnerSplits } from "@/lib/server/redis";

const HOUR = 3_600_000;

/**
 * For ป้าคีน, with the organiser's private link: their bills saved since `?since=` (an ISO time or ms; at most a day
 * back, 6 hours when left out), newest first, with what was paid at the shop and the organiser's own share, so a bank
 * alert can be matched to its bill. Money in minor units, as everywhere here. Nothing about the friends but how many.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/feed/[token]">) {
  const limited = await rateLimit(req, "read");
  if (limited) return limited;
  const { token } = await ctx.params;
  return safely(async () => {
    const owner = await feedOwner(token);
    if (!owner) return jsonError(404, "not_found", "This link isn't connected any more. Make a new one on the Me page.");
    const raw = new URL(req.url).searchParams.get("since");
    const asked = raw ? (/^\d+$/.test(raw) ? Number(raw) : Date.parse(raw)) : NaN;
    const since = Math.max(Number.isFinite(asked) ? asked : Date.now() - 6 * HOUR, Date.now() - 24 * HOUR);
    const bills = (await recentOwnerSplits(owner, since)).map(({ id, doc, savedAt }) => {
      const c = calculate(doc);
      const me = c.people.find((p) => p.personId === ORGANISER_ID);
      const prepaid = c.people.reduce((s, p) => s + p.prepaid, 0);
      return {
        id,
        title: doc.title,
        savedAt: new Date(savedAt).toISOString(),
        date: doc.date ?? doc.createdAt.slice(0, 10),
        currency: doc.currency,
        total: c.total,
        // what the organiser's card or account paid at the shop: the bill, less what friends paid there themselves
        // and what was paid for everyone (a deposit, a voucher)
        paid: c.total - prepaid - c.forEveryone,
        mine: me ? me.payable : 0,
        people: doc.people.length,
        items: [...new Set(doc.items.map((i) => i.name.trim()).filter(Boolean))].slice(0, 15),
      };
    });
    return Response.json({ bills }, { headers: { "Cache-Control": "no-store" } });
  });
}
