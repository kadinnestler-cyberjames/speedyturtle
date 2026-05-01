import { NextRequest, NextResponse } from "next/server";
import { listTargets, runMonitorOnce } from "@/lib/blue-team/monitor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requiredSecret = process.env.MONITOR_CRON_SECRET;
  if (requiredSecret) {
    const provided = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== requiredSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const targets = await listTargets();
  const results: { targetId: string; status: "ok" | "skipped" | "error"; detail: string }[] = [];

  for (const target of targets) {
    try {
      const alert = await runMonitorOnce(target.id);
      if (!alert) {
        results.push({ targetId: target.id, status: "error", detail: "monitor returned null" });
        continue;
      }
      results.push({
        targetId: target.id,
        status: "ok",
        detail: `${alert.newCriticals.length} new critical, ${alert.newHighs.length} new high. ${alert.deliveryNote}`,
      });
    } catch (err) {
      results.push({
        targetId: target.id,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), targetCount: targets.length, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
