import { randomUUID } from "node:crypto";
import { runRedTeamScan } from "../orchestrator/red-team";
import { saveScan, loadScan } from "../store";
import type { Finding, Scan } from "../types";
import type { MonitorTarget, MonitorAlert, FindingFingerprint } from "./types";
import {
  saveMonitorTarget,
  loadMonitorTarget,
  listMonitorTargets,
  saveMonitorAlert,
} from "./store";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function registerTarget(input: { target: string; email: string }): Promise<MonitorTarget> {
  const cleanTarget = input.target.replace(/^https?:\/\//, "").split("/")[0];
  const id = randomUUID();
  const target: MonitorTarget = {
    id,
    target: cleanTarget,
    email: input.email,
    baselineScanId: null,
    lastScanAt: null,
    lastScanId: null,
    registeredAt: new Date().toISOString(),
  };
  await saveMonitorTarget(target);
  return target;
}

export async function listTargets(): Promise<MonitorTarget[]> {
  return listMonitorTargets();
}

export async function loadTarget(id: string): Promise<MonitorTarget | null> {
  return loadMonitorTarget(id);
}

export function fingerprint(f: Finding): FindingFingerprint {
  return [f.severity, f.category, f.title.trim().toLowerCase(), f.affectedAsset.trim().toLowerCase()].join("|");
}

export function diffFindings(
  baseline: Finding[],
  current: Finding[]
): { fixed: Finding[]; persistent: Finding[]; newSince: Finding[] } {
  const baselineFps = new Set(baseline.map(fingerprint));
  const currentFps = new Set(current.map(fingerprint));

  const fixed = baseline.filter((f) => !currentFps.has(fingerprint(f)));
  const persistent = current.filter((f) => baselineFps.has(fingerprint(f)));
  const newSince = current.filter((f) => !baselineFps.has(fingerprint(f)));
  return { fixed, persistent, newSince };
}

export async function runMonitorOnce(targetId: string): Promise<MonitorAlert | null> {
  const target = await loadMonitorTarget(targetId);
  if (!target) return null;

  const scan: Scan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    input: {
      target: target.target,
      mode: "blue-team",
      email: target.email,
      authorizationConfirmed: true,
    },
    status: "queued",
    progress: { step: "queued", pct: 0, message: "Monitor scan queued..." },
    findings: [],
  };
  await saveScan(scan);

  let scanResult: Scan;
  try {
    scanResult = await runRedTeamScan(scan);
  } catch (err) {
    console.error("Monitor scan failed:", err);
    return null;
  }

  let baselineFindings: Finding[] = [];
  if (target.baselineScanId) {
    const baseline = await loadScan(target.baselineScanId);
    if (baseline) baselineFindings = baseline.findings;
  }

  const diff = diffFindings(baselineFindings, scanResult.findings);
  const newCriticals = diff.newSince.filter((f) => f.severity === "critical");
  const newHighs = diff.newSince.filter((f) => f.severity === "high");

  const alert: MonitorAlert = {
    targetId: target.id,
    target: target.target,
    email: target.email,
    scanId: scanResult.id,
    baselineScanId: target.baselineScanId,
    generatedAt: new Date().toISOString(),
    newCriticals,
    newHighs,
    delivered: false,
    deliveryNote: "",
  };

  if (newCriticals.length > 0 || newHighs.length > 0) {
    const delivery = await sendAlert(alert);
    alert.delivered = delivery.delivered;
    alert.deliveryNote = delivery.note;
  } else {
    alert.deliveryNote = "No new criticals or highs since baseline; alert suppressed.";
  }

  await saveMonitorAlert(alert);

  const updatedTarget: MonitorTarget = {
    ...target,
    baselineScanId: target.baselineScanId ?? scanResult.id,
    lastScanAt: new Date().toISOString(),
    lastScanId: scanResult.id,
  };
  await saveMonitorTarget(updatedTarget);

  return alert;
}

export async function sendAlert(alert: MonitorAlert): Promise<{ delivered: boolean; note: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const baseUrl = process.env.SPEEDYTURTLE_PUBLIC_URL || "";
  const scanLink = baseUrl ? `${baseUrl}/scan/${alert.scanId}` : `/scan/${alert.scanId}`;

  const subject = `${alert.newCriticals.length} new criticals on ${alert.target} since last scan`;

  const lines: string[] = [];
  lines.push(`speedyturtle Blue Team monitor detected new high-severity findings on ${alert.target}.`);
  lines.push("");
  if (alert.newCriticals.length > 0) {
    lines.push(`NEW CRITICAL (${alert.newCriticals.length}):`);
    for (const f of alert.newCriticals.slice(0, 10)) {
      lines.push(`  - ${f.title} (${f.affectedAsset})`);
    }
    lines.push("");
  }
  if (alert.newHighs.length > 0) {
    lines.push(`NEW HIGH (${alert.newHighs.length}):`);
    for (const f of alert.newHighs.slice(0, 10)) {
      lines.push(`  - ${f.title} (${f.affectedAsset})`);
    }
    lines.push("");
  }
  lines.push(`Full scan: ${scanLink}`);
  const body = lines.join("\n");

  if (!apiKey) {
    console.log("[monitor] Resend key absent — would have sent alert:", { subject, to: alert.email });
    return { delivered: false, note: "RESEND_API_KEY not set; alert logged only." };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SPEEDYTURTLE_FROM_EMAIL || "speedyturtle <alerts@speedyturtle.dev>",
        to: alert.email,
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { delivered: false, note: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { delivered: true, note: `Sent via Resend at ${new Date().toISOString()}` };
  } catch (err) {
    return { delivered: false, note: `Resend exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}
