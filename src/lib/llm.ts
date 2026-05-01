import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM completion abstraction. Two backends:
 *
 * 1. Anthropic SDK (when ANTHROPIC_API_KEY is set) — production path, lowest latency.
 * 2. Claude Code CLI subprocess (`claude -p`) — uses the operator's Claude
 *    subscription, no API key needed. Higher per-call overhead because each
 *    invocation re-warms a system-prompt cache, but billed against the
 *    subscription. Used for local dev when no key is provisioned.
 *
 * The CLI path requires `claude` 2.1+ on PATH and a logged-in subscription.
 */

export type ModelAlias = "opus" | "sonnet" | "haiku";

const MODEL_MAP: Record<string, ModelAlias> = {
  // Map old explicit IDs used throughout the orchestrator to current aliases.
  "claude-opus-4-5-20250929": "opus",
  "claude-sonnet-4-5-20250929": "sonnet",
  "claude-haiku-4-5-20251001": "haiku",
};

function normalizeModel(model: string | undefined): ModelAlias {
  if (!model) return "sonnet";
  if (model === "opus" || model === "sonnet" || model === "haiku") return model;
  return MODEL_MAP[model] ?? "sonnet";
}

export type CompleteOpts = {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
};

export async function complete(opts: CompleteOpts): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return completeViaSdk(opts);
  }
  return completeViaCli(opts);
}

async function completeViaSdk({ system, user, model, maxTokens = 4000 }: CompleteOpts): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const alias = normalizeModel(model);
  const fullModel =
    alias === "opus" ? "claude-opus-4-7" : alias === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const res = await client.messages.create({
    model: fullModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

async function completeViaCli({ system, user, model }: CompleteOpts): Promise<string> {
  const alias = normalizeModel(model);
  const args = [
    "-p",
    user,
    "--append-system-prompt",
    system,
    "--model",
    alias,
    "--output-format",
    "json",
    "--no-session-persistence",
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`claude CLI not available: ${err.message}. Install Claude Code or set ANTHROPIC_API_KEY.`));
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 500)}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) {
          return reject(new Error(`claude -p reported error: ${parsed.api_error_status ?? "unknown"}`));
        }
        resolve(parsed.result ?? "");
      } catch (e) {
        reject(new Error(`Failed to parse claude -p output: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

export function llmAvailable(): { backend: "sdk" | "cli" | "none"; reason?: string } {
  if (process.env.ANTHROPIC_API_KEY) return { backend: "sdk" };
  // CLI presence isn't probed sync; assume present if no key. The actual
  // call will reject with a clear error if `claude` isn't on PATH.
  return { backend: "cli", reason: "ANTHROPIC_API_KEY not set; using Claude Code subscription via `claude -p`" };
}
