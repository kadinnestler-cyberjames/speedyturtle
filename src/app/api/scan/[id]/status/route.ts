import { NextRequest, NextResponse } from "next/server";
import { loadScan } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await loadScan(id);
  if (!scan) return NextResponse.json({ status: "not-found" }, { status: 404 });
  // ?full=1 returns the entire scan record (used by the result page when
  // it has to fetch from a remote worker via the rewrite). Default stays
  // minimal so the polling path doesn't ship the full payload every tick.
  const full = new URL(req.url).searchParams.get("full") === "1";
  if (full) return NextResponse.json(scan);
  return NextResponse.json({
    id: scan.id,
    status: scan.status,
    progress: scan.progress,
    findingCount: scan.findings.length,
  });
}
