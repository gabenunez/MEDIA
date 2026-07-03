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
};

export default nextConfig;
