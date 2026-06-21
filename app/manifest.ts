import type { MetadataRoute } from "next";

// PWA manifest. Next.js auto-serves this at `/manifest.webmanifest`
// when the file exists, and links it from <head> via the metadata
// system. Mainly used for "Add to Home Screen" on mobile and the
// standalone-app appearance once installed — both nudge return visits
// up, which compounds with organic acquisition.
//
// Reusing the existing PNG assets in public/ rather than committing
// new icon variants. Browsers handle ranged sizing via `purpose: "any"`
// and fall back to apple-touch-icon for iOS Home Screen anyway.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MadenKorea — Authentic Korean Beauty in India",
    short_name: "MadenKorea",
    description:
      "Curated K-beauty brands, fast delivery across India, 100% authentic.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#359fd9",
    orientation: "portrait",
    icons: [
      {
        src: "/square-logo.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["shopping", "lifestyle", "beauty"],
    lang: "en-IN",
  };
}
