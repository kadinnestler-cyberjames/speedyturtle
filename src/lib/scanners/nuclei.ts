import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
const BIN = process.env.NUCLEI_BIN || "/Users/kadinnestler/.local/bin/nuclei";

export type NucleiFinding = {
  templateId: string;
  templateName?: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  matchedAt: string;
  description?: string;
  reference?: string[];
  cveId?: string;
  cvssScore?: number;
  type: string;
  host: string;
};

export async function runNuclei(
  targets: string[],
  options: { severity?: string; timeoutMs?: number } = {}
): Promise<NucleiFinding[]> {
  if (targets.length === 0) return [];
  const dir = join(tmpdir(), "speedyturtle");
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const inputFile = join(dir, `nuclei-input-${id}.txt`);
  const outputFile = join(dir, `nuclei-out-${id}.jsonl`);

  await writeFile(inputFile, targets.join("\n"));

  try {
    const args = [
      "-l",
      inputFile,
      "-jle",
      outputFile,
      "-severity",
      options.severity ?? "medium,high,critical",
      "-rl",
      "150",
      "-c",
      "25",
      "-silent",
      "-no-color",
      "-disable-update-check",
      "-timeout",
      "8",
      "-retries",
      "1",
    ];
    // 5996+ templates take ~6min/target at -rl 30; bumping rl/c gets it to ~3min
    // and giving a 9min ceiling avoids SIGTERM-mid-scan (which produced 0 findings
    // because the JSONL file is truncated when killed).
    await exec(BIN, args, { timeout: options.timeoutMs ?? 540_000, maxBuffer: 20 * 1024 * 1024 });
  } catch (err: unknown) {
    // nuclei exits non-zero on no findings; that's fine
    const code = (err as { code?: number })?.code;
    if (code !== 0 && code !== undefined && code !== 2) {
      console.error("nuclei error:", err);
    }
  }

  let raw = "";
  try {
    raw = await readFile(outputFile, "utf8");
  } catch {
    raw = "";
  }
  await Promise.all([unlink(inputFile).catch(() => {}), unlink(outputFile).catch(() => {})]);

  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        const j = JSON.parse(l);
        return {
          templateId: j["template-id"] || j.templateID,
          templateName: j.info?.name,
          severity: (j.info?.severity || "info") as NucleiFinding["severity"],
          matchedAt: j["matched-at"] || j.host,
          description: j.info?.description,
          reference: j.info?.reference,
          cveId: j.info?.classification?.["cve-id"]?.[0],
          cvssScore: j.info?.classification?.["cvss-score"],
          type: j.type || "http",
          host: j.host || j["matched-at"],
        } as NucleiFinding;
      } catch {
        return null;
      }
    })
    .filter((x): x is NucleiFinding => x !== null);
}
