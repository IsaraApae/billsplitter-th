import { iconResponse } from "@/lib/icon";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  if (size !== "192" && size !== "512") return new Response("Not found", { status: 404 });
  return iconResponse(Number(size));
}
