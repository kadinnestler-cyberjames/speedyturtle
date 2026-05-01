import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const BIN = process.env.SUBFINDER_BIN || "/Users/kadinnestler/.local/bin/subfinder";

export type SubdomainResult = {
  host: string;
  source?: string;
};

export async function runSubfinder(domain: string, timeoutMs = 60_000): Promise<SubdomainResult[]> {
  // Strip protocol + path if user pasted a full URL
  const clean = domain.replace(/^https?:\/\//, "").split("/")[0];
  try {
    const { stdout } = await exec(
      BIN,
      ["-d", clean, "-silent", "-oJ", "-all", "-timeout", "30"],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          const j = JSON.parse(l);
          return { host: j.host, source: j.source } as SubdomainResult;
        } catch {
          return null;
        }
      })
      .filter((x): x is SubdomainResult => x !== null);
  } catch (err) {
    console.error("subfinder failed:", err);
    return [];
  }
}
