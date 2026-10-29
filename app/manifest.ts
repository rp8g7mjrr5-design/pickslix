import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LayLock",
    short_name: "LayLock",
    description: "Over/under probabilities for DraftKings Pick 6 player props",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07090d",
    theme_color: "#07090d",
    categories: ["sports", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Daily Lock", short_name: "Lock", url: "/lock", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Tracker", url: "/tracker", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
