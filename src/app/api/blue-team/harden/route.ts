import { NextRequest, NextResponse } from "next/server";
import { loadScan } from "@/lib/store";
import { generateHardeningPlan } from "@/lib/blue-team/hardening";
import { saveHardeningPlan, loadHardeningPlan } from "@/lib/blue-team/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scanId = typeof body?.scanId === "string" ? body.scanId : "";
    if (!scanId) return NextResponse.json({ error: "scanId required" }, { status: 400 });

    const scan = await loadScan(scanId);
    if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    if (scan.status !== "ready") {
      return NextResponse.json({ error: `Scan is ${scan.status}; wait for it to finish` }, { status: 409 });
    }

    const existing = await loadHardeningPlan(scanId);
    if (existing && req.headers.get("x-force-regen") !== "1") {
      return NextResponse.json(existing);
    }

    const plan = await generateHardeningPlan(scan);
    await saveHardeningPlan(plan);

    // Fire-and-forget the report email. Skips silently when RESEND_API_KEY
    // is unset; logs other failures without blocking the response.
    void (async () => {
      try {
        const { sendBlueTeamReport } = await import("@/lib/email");
        const r = await sendBlueTeamReport(scan, plan);
        if (!r.ok && r.error && !r.error.includes("RESEND_API_KEY not set")) {
          console.warn("Blue Team report email failed:", r.error);
        }
      } catch (err) {
        console.warn("Blue Team report email crashed:", err);
      }
    })();

    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId") || "";
  if (!scanId) return NextResponse.json({ error: "scanId required" }, { status: 400 });
  const plan = await loadHardeningPlan(scanId);
  if (!plan) return NextResponse.json({ error: "No hardening plan yet" }, { status: 404 });
  return NextResponse.json(plan);
}
