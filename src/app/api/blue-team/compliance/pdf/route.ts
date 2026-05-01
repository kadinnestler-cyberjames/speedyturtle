import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadScan } from "@/lib/store";
import {
  selectFramework,
  computeCoverage,
} from "@/lib/blue-team/compliance";
import { CompliancePdfReport } from "@/components/CompliancePdfReport";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId") || "";
  const frameworkSlug = url.searchParams.get("framework") || "";

  const framework = selectFramework(frameworkSlug);
  if (!framework) return NextResponse.json({ error: "framework required" }, { status: 400 });

  let findings: import("@/lib/types").Finding[] = [];
  let target: string | null = null;
  if (scanId) {
    const scan = await loadScan(scanId);
    if (scan) {
      findings = scan.findings;
      target = scan.input.target;
    }
  }

  const coverage = computeCoverage(framework, findings);
  const element = CompliancePdfReport({ coverage, scanTarget: target, scanId: scanId || null });
  const buffer = await renderToBuffer(element);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="speedyturtle-compliance-${frameworkSlug}.pdf"`,
    },
  });
}
