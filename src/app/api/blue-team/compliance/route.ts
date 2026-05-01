import { NextRequest, NextResponse } from "next/server";
import { loadScan } from "@/lib/store";
import {
  selectFramework,
  computeCoverage,
  summarizeFrameworks,
} from "@/lib/blue-team/compliance";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId") || "";
  const frameworkSlug = url.searchParams.get("framework") || "";

  if (!frameworkSlug) {
    return NextResponse.json({ frameworks: summarizeFrameworks() });
  }

  const framework = selectFramework(frameworkSlug);
  if (!framework) return NextResponse.json({ error: "Unknown framework" }, { status: 404 });

  let findings: import("@/lib/types").Finding[] = [];
  if (scanId) {
    const scan = await loadScan(scanId);
    if (scan) findings = scan.findings;
  }

  const coverage = computeCoverage(framework, findings);
  return NextResponse.json({
    scanId: scanId || null,
    coverage,
  });
}
