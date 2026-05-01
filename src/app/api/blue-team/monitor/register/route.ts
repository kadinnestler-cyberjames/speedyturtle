import { NextRequest, NextResponse } from "next/server";
import { registerTarget } from "@/lib/blue-team/monitor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const target = typeof body?.target === "string" ? body.target.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "valid email required" }, { status: 400 });
    }
    const monitorTarget = await registerTarget({ target, email });
    return NextResponse.json(monitorTarget);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
