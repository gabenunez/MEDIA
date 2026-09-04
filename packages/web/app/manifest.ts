import type { MetadataRoute } from "next";
import { APP_NAME } from "@media-app/shared";
import { withBasePath } from "@/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  const home = withBasePath("/");
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Self-hosted movies and TV — install and watch compressed downloads offline.",
    start_url: home,
    scope: home,
    display: "standalone",
    background_color: "#0c1415",
    theme_color: "#0c1415",
    lang: "en",
    id: home,
    icons: [
      {
        src: withBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/icon-512-maskable.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
