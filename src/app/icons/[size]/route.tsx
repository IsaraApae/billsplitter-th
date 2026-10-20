import { iconResponse } from "@/lib/icon";

export const dynamic = "force-static";

// 192 and 512: the receipt on a transparent background; maskable: on its
// white tile (Android crops maskable icons into its own shapes).
const SIZES = { "192": 192, "512": 512, maskable: 512 } as const;

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  if (!(size in SIZES)) return new Response("Not found", { status: 404 });
  return iconResponse(SIZES[size as keyof typeof SIZES], { tile: size === "maskable" });
}
