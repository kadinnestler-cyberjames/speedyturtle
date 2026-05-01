import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
// 60 s is plenty — this handler does NOT run the benchmark. It can't:
// 1. Vercel serverless functions cap at 5 minutes; CTI-REALM runs longer.
// 2. There is no Docker in the serverless runtime, and the eval pins
//    sandbox=("docker", compose.yaml). Without Docker, the Kusto emulator
//    + MITRE service tools can't boot inside a Vercel function.
// The realistic pipeline is: developer (or future remote worker) runs the
// benchmark on a real machine -> commits the updated cti-realm-scores.json
// -> Vercel rebuilds -> /benchmark/cti-realm picks up the new score. This
// cron is the stable hook for a future remote worker, plus a way to keep
// edge caches warm.
//
// Production safety: if CRON_SECRET is unset/empty in a production environment
// (VERCEL_ENV=production or NODE_ENV=production), POST returns 503 instead of
// silently accepting unauthenticated triggers. Dev/preview keep the old
// pass-through with a one-time console.warn so local dev isn't broken.
export const maxDuration = 60;

type ScoreEntry = {
  run_id: string;
  task: string;
  model?: string;
  score: number | null;
  per_checkpoint?: Record<string, number>;
  per_domain?: Record<string, number>;
  samples_run?: number;
  samples_total?: number;
  inspect_log?: string;
};

type ScoreFile = {
  history?: ScoreEntry[];
  status?: string;
  refreshedAt?: string;
};

// Module-level flag so we only emit the dev/preview pass-through warning once
// per cold start instead of on every POST.
let warnedAboutMissingSecret = false;

async function readScoreFile(): Promise<{ data: ScoreFile; missing: boolean; error?: string }> {
  const fp = path.join(process.cwd(), "data", "cti-realm-scores.json");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return { data: { history: [], status: "awaiting-first-run" }, missing: true };
    }
    const parsed = JSON.parse(trimmed) as ScoreFile;
    return { data: parsed, missing: false };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") {
      return { data: { history: [], status: "awaiting-first-run" }, missing: true };
    }
    return {
      data: { history: [], status: "read-error" },
      missing: true,
      error: e?.message ?? String(err),
    };
  }
}

export async function GET() {
  const { data, missing, error } = await readScoreFile();
  const body = {
    ...data,
    status: data.status ?? (missing ? "awaiting-first-run" : "ok"),
    ...(error ? { readError: error } : {}),
  };
  return NextResponse.json(body, {
    status: 200,
    headers: {
      // Short cache so the page reflects new commits within a minute,
      // but doesn't hammer the function on burst traffic.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function POST(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. We accept that header
  // and a fallback x-cron-secret header for local testing.
  const secret = process.env.CRON_SECRET?.trim();
  const isProduction =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProduction) {
      // Fail closed in production — a missing CRON_SECRET means anyone could
      // trigger the refresh route. The route is a no-op today, but it is the
      // designated hook for a future remote benchmark worker (which would not
      // be a no-op). Better to disable it entirely until the env var is set.
      return NextResponse.json(
        {
          error:
            "CRON_SECRET not configured — refresh endpoint disabled until env var is set",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Dev / preview: keep the old pass-through so local development isn't
    // broken, but warn once per cold start so it's noticeable.
    if (!warnedAboutMissingSecret) {
      console.warn(
        "[cti-realm/refresh] CRON_SECRET not set — POST is unauthenticated. " +
          "This is allowed in dev/preview but MUST be configured before production.",
      );
      warnedAboutMissingSecret = true;
    }
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "");
    const xCron = req.headers.get("x-cron-secret") ?? "";
    if (bearer !== secret && xCron !== secret) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const { data, missing, error } = await readScoreFile();

  // Plumbed for a future remote worker: today this just re-reads the file and
  // returns its current state. When a remote benchmark runner is wired up, this
  // is where we would POST to it (with a separate worker secret) and surface
  // the worker's "queued" or "running" status.
  // Intentionally NOT trying to invoke the benchmark inline — see file header.
  console.log(
    "[cti-realm/refresh] cron fired",
    JSON.stringify({
      at: new Date().toISOString(),
      historyLength: data.history?.length ?? 0,
      missing,
      readError: error ?? null,
    }),
  );

  const body = {
    refreshedAt: new Date().toISOString(),
    historyLength: data.history?.length ?? 0,
    latest: data.history && data.history.length > 0 ? data.history[data.history.length - 1] : null,
    status: missing ? "awaiting-first-run" : "ok",
    note: "This route does not run the benchmark — it returns the current score state. The actual eval runs out-of-band; updated scores arrive via git commit + Vercel rebuild.",
    ...(error ? { readError: error } : {}),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
