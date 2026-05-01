import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { saveScan } from "@/lib/store";
import { canScan, recordScan } from "@/lib/billing";
import { runRedTeamScan } from "@/lib/orchestrator/red-team";
import type { Scan, ScanInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Vercel serverless doesn't ship with the scanner CLIs (nuclei, httpx,
    // subfinder) and has a 5-minute function ceiling that nuclei can't fit
    // in. Auto-detect Vercel via the platform-provided VERCEL env var (always
    // "1" on Vercel deploys); the SPEEDYTURTLE_DEMO_MODE override exists for
    // local-prod testing.
    const inDemoMode = process.env.VERCEL === "1" || process.env.SPEEDYTURTLE_DEMO_MODE === "1";
    if (inDemoMode) {
      return NextResponse.json(
        {
          error: "Live scans are self-hosted only.",
          why:
            "speedyturtle's scanner pipeline (nuclei + httpx + subfinder + Claude orchestrator) needs the full toolchain on the host. We don't run live scans on Vercel because the scanners aren't installed there and individual scans exceed the 5-minute serverless ceiling.",
          alternatives: {
            seeSampleReport: "/demo",
            viewBenchmark: "/benchmark/cti-realm",
            selfHost: "https://github.com/kadinnestler-cyberjames/speedyturtle",
          },
        },
        { status: 503 },
      );
    }

    const body = await req.json();
    const input = validate(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    // Quota enforcement — free users get 1/mo, starter 10/mo, pro/unlimited unlimited.
    const quota = await canScan(input.value.email);
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: quota.reason,
          tier: quota.tier,
          scansThisMonth: quota.scansThisMonth,
          scanCap: quota.scanCap,
          upgrade: "/pricing",
        },
        { status: 402 }
      );
    }

    const scan: Scan = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      input: input.value,
      status: "queued",
      progress: { step: "queued", pct: 0, message: "Queued — starting in a moment…" },
      findings: [],
    };
    await saveScan(scan);

    // Record the scan against the user's monthly quota immediately on accept.
    // We charge on submission (not completion) so retries from a failed scan
    // don't bypass the cap.
    await recordScan(input.value.email);

    // Kick off the scan in the background. We intentionally don't await — the route
    // returns immediately and the scan runs in the function's keep-alive window.
    // For long scans, the ULTRAPROJECT worker on the user's machine takes over.
    runRedTeamScan(scan).catch(async (err) => {
      console.error("Scan failed:", err);
      const failed = { ...scan, status: "failed" as const, error: String(err?.message ?? err) };
      await saveScan(failed);
    });

    return NextResponse.json({ id: scan.id, status: "queued" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function validate(body: unknown): { ok: true; value: ScanInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const target = typeof b.target === "string" ? b.target.trim() : "";
  const mode = b.mode === "blue-team" ? "blue-team" : "red-team";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const auth = b.authorizationConfirmed === true;

  if (!target) return { ok: false, error: "Target required" };
  if (!email || !email.includes("@")) return { ok: false, error: "Valid email required" };
  if (!auth) return { ok: false, error: "You must confirm you have authorization to scan this target" };

  // Reject obvious public infrastructure to prevent abuse
  const blocked = [
    /\.gov$/i, /\.mil$/i, /amazon\.com$/i, /google\.com$/i, /microsoft\.com$/i, /apple\.com$/i,
    /facebook\.com$/i, /openai\.com$/i, /anthropic\.com$/i, /github\.com$/i, /vercel\.com$/i,
    /cloudflare\.com$/i, /linkedin\.com$/i, /twitter\.com$/i, /x\.com$/i,
  ];
  const cleanTarget = target.replace(/^https?:\/\//, "").split("/")[0];
  if (blocked.some((rx) => rx.test(cleanTarget))) {
    return { ok: false, error: `Refusing to scan ${cleanTarget} — large public infrastructure is out of scope.` };
  }

  return { ok: true, value: { target: cleanTarget, mode, email, authorizationConfirmed: auth } };
}
