import type { MetadataRoute } from "next";
import { APP_NAME } from "@media-app/shared";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Self-hosted movies and TV — install and watch compressed downloads offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c1415",
    theme_color: "#0c1415",
    lang: "en",
    id: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
