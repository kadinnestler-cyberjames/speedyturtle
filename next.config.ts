import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the score JSON into the serverless function so /benchmark/cti-realm
  // and /api/benchmark/cti-realm/refresh can read it on Vercel. Without this,
  // Next's output file tracing doesn't follow the runtime fs.readFile path
  // and the file is missing on the deployed function.
  outputFileTracingIncludes: {
    "/benchmark/cti-realm": ["./data/cti-realm-scores.json"],
    "/api/benchmark/cti-realm/refresh": ["./data/cti-realm-scores.json"],
  },
  // When SPEEDYTURTLE_WORKER_URL is set, the scan submission/poll/result paths
  // are proxied to a self-hosted worker (typically a Cloudflare Tunnel back to
  // the operator's own machine where nuclei/httpx/subfinder + claude-agent-sdk
  // live). Vercel can't run the scanners or the long-running orchestrator
  // pipeline directly — this rewrite makes the live site a thin proxy and the
  // operator's machine the actual worker. /api/scan demo-mode 503 falls back
  // when the env var is unset.
  async rewrites() {
    const worker = process.env.SPEEDYTURTLE_WORKER_URL?.replace(/\/$/, "");
    if (!worker) return [];
    // beforeFiles: take precedence over the local route handlers (otherwise
    // /api/scan would resolve to the demo-mode 503 in route.ts before the
    // rewrite gets a chance to run).
    return {
      beforeFiles: [
        { source: "/api/scan", destination: `${worker}/api/scan` },
        { source: "/api/scan/:path*", destination: `${worker}/api/scan/:path*` },
        { source: "/scan/:path*", destination: `${worker}/scan/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
