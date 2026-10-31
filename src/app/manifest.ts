import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bill Splitter",
    short_name: "Bill Split",
    description: "Scan a receipt, split it, share a link and track who has paid.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef4ee",
    theme_color: "#00B368",
    // ?v= changes with the logo so phones fetch the new one.
    icons: [
      { src: "/icons/192?v=6", sizes: "192x192", type: "image/png" },
      { src: "/icons/512?v=6", sizes: "512x512", type: "image/png" },
    ],
  };
}
