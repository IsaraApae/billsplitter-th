import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bill Splitter",
    short_name: "Bill Split",
    description: "Scan a receipt, split it, share a link and track who has paid.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#059669",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
