import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PdfReport } from "@/components/PdfReport";
import { loadScan } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await loadScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  const element = PdfReport({ scan });
  const buffer = await renderToBuffer(element);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="speedyturtle-${scan.input.target.replace(/[^a-z0-9]+/g, "-")}.pdf"`,
    },
  });
}
