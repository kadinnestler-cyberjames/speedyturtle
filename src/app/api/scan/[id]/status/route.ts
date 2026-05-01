import { NextRequest, NextResponse } from "next/server";
import { loadScan } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await loadScan(id);
  if (!scan) return NextResponse.json({ status: "not-found" }, { status: 404 });
  return NextResponse.json({
    id: scan.id,
    status: scan.status,
    progress: scan.progress,
    findingCount: scan.findings.length,
  });
}
