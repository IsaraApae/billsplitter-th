import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Bills, big bills and shared lists stay out of search with their own noindex
 * tag rather than here: chat apps that honour robots.txt (X, for one) would
 * otherwise stop showing their link previews.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
