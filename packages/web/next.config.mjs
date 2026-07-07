const internalApiPort = process.env.MEDIA_INTERNAL_API_PORT ?? "8097";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${internalApiPort}/api/:path*`,
      },
    ];
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  experimental: {
    optimizePackageImports: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
    ],
    turbopackFileSystemCacheForBuild: true,
  },
};

export default nextConfig;
