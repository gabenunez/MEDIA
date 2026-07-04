/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export bakes Server Component shells at build time (PPR-like static
  // layout). Runtime PPR requires removing output: "export" and a Next.js server.
  output: "export",
  trailingSlash: true,
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
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
