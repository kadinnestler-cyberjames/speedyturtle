import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  HardeningPlan,
  VerificationReport,
  MonitorTarget,
  MonitorAlert,
} from "./types";

const STORE_DIR = process.env.SPEEDYTURTLE_STORE_DIR || "/tmp/speedyturtle";
const BT_DIR = path.join(STORE_DIR, "blue-team");
const HARDEN_DIR = path.join(BT_DIR, "harden");
const VERIFY_DIR = path.join(BT_DIR, "verify");
const MONITOR_DIR = path.join(BT_DIR, "monitor");
const ALERT_DIR = path.join(BT_DIR, "alerts");

async function ensureDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(HARDEN_DIR, { recursive: true }),
    fs.mkdir(VERIFY_DIR, { recursive: true }),
    fs.mkdir(MONITOR_DIR, { recursive: true }),
    fs.mkdir(ALERT_DIR, { recursive: true }),
  ]);
}

export async function saveHardeningPlan(plan: HardeningPlan): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(HARDEN_DIR, `${plan.scanId}.json`),
    JSON.stringify(plan, null, 2)
  );
}

export async function loadHardeningPlan(scanId: string): Promise<HardeningPlan | null> {
  try {
    const raw = await fs.readFile(path.join(HARDEN_DIR, `${scanId}.json`), "utf8");
    return JSON.parse(raw) as HardeningPlan;
  } catch {
    return null;
  }
}

export async function saveVerificationReport(report: VerificationReport): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(VERIFY_DIR, `${report.verifyScanId}.json`),
    JSON.stringify(report, null, 2)
  );
}

export async function loadVerificationReport(
  verifyScanId: string
): Promise<VerificationReport | null> {
  try {
    const raw = await fs.readFile(path.join(VERIFY_DIR, `${verifyScanId}.json`), "utf8");
    return JSON.parse(raw) as VerificationReport;
  } catch {
    return null;
  }
}

export async function saveMonitorTarget(target: MonitorTarget): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(MONITOR_DIR, `${target.id}.json`),
    JSON.stringify(target, null, 2)
  );
}

export async function loadMonitorTarget(id: string): Promise<MonitorTarget | null> {
  try {
    const raw = await fs.readFile(path.join(MONITOR_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as MonitorTarget;
  } catch {
    return null;
  }
}

export async function listMonitorTargets(): Promise<MonitorTarget[]> {
  try {
    await ensureDirs();
    const files = await fs.readdir(MONITOR_DIR);
    const targets = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(MONITOR_DIR, f), "utf8");
            return JSON.parse(raw) as MonitorTarget;
          } catch {
            return null;
          }
        })
    );
    return targets.filter((t): t is MonitorTarget => t !== null);
  } catch {
    return [];
  }
}

export async function saveMonitorAlert(alert: MonitorAlert): Promise<void> {
  await ensureDirs();
  const filename = `${alert.targetId}-${alert.scanId}.json`;
  await fs.writeFile(path.join(ALERT_DIR, filename), JSON.stringify(alert, null, 2));
}

export async function listAlerts(): Promise<MonitorAlert[]> {
  try {
    await ensureDirs();
    const files = await fs.readdir(ALERT_DIR);
    const alerts = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(ALERT_DIR, f), "utf8");
            return JSON.parse(raw) as MonitorAlert;
          } catch {
            return null;
          }
        })
    );
    return alerts.filter((a): a is MonitorAlert => a !== null);
  } catch {
    return [];
  }
}
