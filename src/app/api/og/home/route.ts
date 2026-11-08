import { shareImage } from "@/lib/server/shareImage";

// Made once at build time: the plain Bill Splitter card, for links to the app itself.
export const dynamic = "force-static";

/** Link preview for the home page (and the app's own pages): the same card a missing bill shows. */
export async function GET() {
  return shareImage(null);
}
