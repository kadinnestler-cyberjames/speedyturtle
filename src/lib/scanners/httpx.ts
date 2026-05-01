import { spawn } from "node:child_process";

const BIN = process.env.HTTPX_BIN || "/Users/kadinnestler/.local/bin/httpx";

function runHttpxBinary(args: string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("error", (err) => { clearTimeout(t); reject(err); });
    child.on("close", () => { clearTimeout(t); resolve(stdout); });
    child.stdin.write(input);
    child.stdin.end();
  });
}

export type HttpProbeResult = {
  url: string;
  host: string;
  statusCode: number;
  title?: string;
  webServer?: string;
  contentType?: string;
  contentLength?: number;
  techStack?: string[];
  tlsGrade?: string;
};

export async function runHttpx(hosts: string[], timeoutMs = 60_000): Promise<HttpProbeResult[]> {
  if (hosts.length === 0) return [];
  try {
    const input = hosts.join("\n");
    const stdout = await runHttpxBinary(
      [
        "-silent", "-json", "-status-code", "-title", "-tech-detect",
        "-web-server", "-content-type", "-content-length", "-no-color",
        "-timeout", "5", "-threads", "20", "-rate-limit", "30",
      ],
      input,
      timeoutMs
    );
    return stdout
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          const j = JSON.parse(l);
          return {
            url: j.url,
            host: j.host || j.input,
            statusCode: j.status_code,
            title: j.title,
            webServer: j.webserver,
            contentType: j.content_type,
            contentLength: j.content_length,
            techStack: j.tech,
            tlsGrade: j.tls?.cipher,
          } as HttpProbeResult;
        } catch {
          return null;
        }
      })
      .filter((x): x is HttpProbeResult => x !== null);
  } catch (err) {
    console.error("httpx failed:", err);
    return [];
  }
}
