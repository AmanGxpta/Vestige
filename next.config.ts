import type { NextConfig } from "next";

/**
 * Hybrid deploy: the UI, public evidence pages and reviewed manifests are served by Vercel.
 * The stateful API (SQLite + server-only attester key) runs on a separate host. When
 * VESTIGE_API_ORIGIN is set at build time (e.g. a Cloudflare tunnel URL), every /api/* request
 * is proxied there *before* the local route handlers, so the browser stays same-origin
 * (SIWE origin checks, cookies). Unset (local dev, self-host) → the local handlers serve /api.
 */
const apiOrigin = process.env.VESTIGE_API_ORIGIN?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiOrigin) return { beforeFiles: [], afterFiles: [], fallback: [] };
    return { beforeFiles: [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
