import { NextRequest, NextResponse } from "next/server";
import { loadScan } from "@/lib/store";
import {
  loadVerificationReport,
  saveVerificationReport,
} from "@/lib/blue-team/store";
import { diffFindings } from "@/lib/blue-team/monitor";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const verifyScan = await loadScan(id);
  if (!verifyScan) return NextResponse.json({ error: "Verify scan not found" }, { status: 404 });

  let report = await loadVerificationReport(id);
  if (!report && verifyScan.status === "ready") {
    const url = new URL(_req.url);
    const originalScanId = url.searchParams.get("originalScanId") || "";
    if (originalScanId) {
      const original = await loadScan(originalScanId);
      if (original) {
        const diff = diffFindings(original.findings, verifyScan.findings);
        const baseTotal = original.findings.length || 1;
        const coverage = Math.round((diff.fixed.length / baseTotal) * 100);
        report = {
          originalScanId,
          verifyScanId: id,
          generatedAt: new Date().toISOString(),
          fixed: diff.fixed,
          persistent: diff.persistent,
          newSince: diff.newSince,
          coverage,
        };
        await saveVerificationReport(report);
      }
    }
  }

  return NextResponse.json({
    id: verifyScan.id,
    status: verifyScan.status,
    progress: verifyScan.progress,
    report,
  });
}
