import { promises as fs } from "node:fs";
import path from "node:path";
import type { Scan, ScanProgress } from "./types";

const STORE_DIR = process.env.SPEEDYTURTLE_STORE_DIR || "/tmp/speedyturtle";
const SCANS_DIR = path.join(STORE_DIR, "scans");

async function ensureDirs() {
  await fs.mkdir(SCANS_DIR, { recursive: true });
}

export async function saveScan(scan: Scan): Promise<void> {
  await ensureDirs();
  await fs.writeFile(path.join(SCANS_DIR, `${scan.id}.json`), JSON.stringify(scan, null, 2));
}

export async function loadScan(id: string): Promise<Scan | null> {
  try {
    const raw = await fs.readFile(path.join(SCANS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as Scan;
  } catch {
    return null;
  }
}

export async function updateScanProgress(id: string, progress: ScanProgress): Promise<void> {
  const scan = await loadScan(id);
  if (!scan) return;
  scan.progress = progress;
  if (progress.step !== "done" && scan.status === "queued") scan.status = "running";
  await saveScan(scan);
}

export async function listScans(): Promise<Scan[]> {
  try {
    await ensureDirs();
    const files = await fs.readdir(SCANS_DIR);
    const scans = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(SCANS_DIR, f), "utf8");
            return JSON.parse(raw) as Scan;
          } catch {
            return null;
          }
        })
    );
    return scans.filter((s): s is Scan => s !== null).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}
