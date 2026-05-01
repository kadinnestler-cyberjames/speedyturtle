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
};

export default nextConfig;
