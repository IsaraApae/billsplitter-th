import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the home page is public; the other pages show what's saved on each phone. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: "monthly", priority: 1 }];
}
