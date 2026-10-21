import type { MetadataRoute } from "next";

/** Installable on phones: "Add to home screen" gives the studio an app icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vastra Studio",
    short_name: "Vastra",
    description: "Your suit, on a model, in a minute.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#15121e",
    theme_color: "#15121e",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
