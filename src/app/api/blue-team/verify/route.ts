import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { loadScan, saveScan } from "@/lib/store";
import { runRedTeamScan } from "@/lib/orchestrator/red-team";
import { saveVerificationReport } from "@/lib/blue-team/store";
import { diffFindings } from "@/lib/blue-team/monitor";
import type { Scan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const originalScanId = typeof body?.originalScanId === "string" ? body.originalScanId : "";
    if (!originalScanId) {
      return NextResponse.json({ error: "originalScanId required" }, { status: 400 });
    }

    const original = await loadScan(originalScanId);
    if (!original) return NextResponse.json({ error: "Original scan not found" }, { status: 404 });

    const verifyScan: Scan = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      input: original.input,
      status: "queued",
      progress: { step: "queued", pct: 0, message: "Verification scan queued..." },
      findings: [],
    };
    await saveScan(verifyScan);

    runRedTeamScan(verifyScan)
      .then(async (completed) => {
        const baseline = await loadScan(originalScanId);
        const baselineFindings = baseline?.findings ?? [];
        const diff = diffFindings(baselineFindings, completed.findings);
        const baseTotal = baselineFindings.length || 1;
        const coverage = Math.round((diff.fixed.length / baseTotal) * 100);
        await saveVerificationReport({
          originalScanId,
          verifyScanId: completed.id,
          generatedAt: new Date().toISOString(),
          fixed: diff.fixed,
          persistent: diff.persistent,
          newSince: diff.newSince,
          coverage,
        });
      })
      .catch(async (err) => {
        console.error("Verify scan failed:", err);
        const failed = { ...verifyScan, status: "failed" as const, error: String(err?.message ?? err) };
        await saveScan(failed);
      });

    return NextResponse.json({ verifyScanId: verifyScan.id, originalScanId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
