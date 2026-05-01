/**
 * CTI-REALM agent — drives Claude through a tool-use loop for the Microsoft
 * CTI-REALM benchmark (https://github.com/UKGovernmentBEIS/inspect_evals)
 * using the Claude Agent SDK against the operator's Claude Code subscription.
 *
 * Two surfaces:
 *
 *   1. {@link runCtiRealmAgent} — programmatic entry. The caller (typically the
 *      Python Inspect AI solver via a JSON-over-stdio bridge) supplies the CTI
 *      report, the eval's tool definitions, and a callback that executes any
 *      tool calls the model emits using Inspect's own tool registry. We do NOT
 *      reimplement MITRE/Sigma/Kusto tools — we proxy them.
 *
 *   2. CLI: `npx tsx src/lib/cti-realm/agent.ts --report-from-stdin --tools-from-stdin`.
 *      The CLI reads a JSON request from stdin and writes JSON responses + tool
 *      requests to stdout. Each line of stdout is a single JSON-encoded event.
 *      The Python solver issues tool-result responses on the agent's stdin.
 *
 * Stdio protocol (newline-delimited JSON, one event per line):
 *
 *   Initial request (Python -> agent stdin):
 *     {
 *       "type": "init",
 *       "ctiReport": "<detection objective + supporting context>",
 *       "tools": [ { "name": "...", "description": "...", "input_schema": {...} } ],
 *       "model": "claude-opus-4-7",
 *       "maxIterations": 25
 *     }
 *
 *   Agent -> Python (stdout, one JSON per line):
 *     { "type": "tool_request", "id": "<tool_use_id>", "name": "...", "input": {...} }
 *     { "type": "assistant_text", "text": "..." }                 // optional, debug
 *     { "type": "final", "result": { ...CtiRealmAgentResult } }
 *     { "type": "error", "message": "..." }
 *
 *   Python -> agent stdin (one JSON per line):
 *     { "type": "tool_result", "id": "<tool_use_id>", "content": "<string>" | [{...}], "isError": false }
 *
 * Auth: the SDK uses the `claude` CLI's existing authentication (Claude Pro/Max
 * subscription via OAuth, or ANTHROPIC_API_KEY if set). No API key is required
 * if the operator has run `claude /login` against their subscription.
 */

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Types — kept identical to the previous Anthropic-SDK-based agent so the
// Python bridge wire format is unchanged.
// -----------------------------------------------------------------------------

export type CtiRealmTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
};

type ToolResultBlockContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; source: unknown }>;

export type CtiRealmAgentResult = {
  techniques: string[];
  dataSources: string[];
  kql: string[];
  sigma: string;
  /**
   * Final raw text the model emitted (typically a JSON blob with sigma_rule, kql_query,
   * query_results) — preserved verbatim for the Inspect scorer.
   */
  finalText: string;
  /**
   * Compact transcript of (role, content) pairs. Tool-use rounds are flattened —
   * each tool call shows up as a synthetic "tool_use:<name>(input)" assistant
   * line and a "tool_result:<id>" user line so the scorer can read the trajectory.
   */
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
  /** Why the loop terminated. */
  stopReason:
    | "end_turn"
    | "max_iterations"
    | "tool_use_error"
    | "model_error"
    | "stop_sequence"
    | "submit"
    | "unknown";
};

export type ToolExecutor = (
  toolUseId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
) => Promise<{ content: string | ToolResultBlockContent; isError?: boolean }>;

export type RunCtiRealmAgentOptions = {
  ctiReport: string;
  tools: CtiRealmTool[];
  /** Model literal; defaults to `claude-opus-4-7`. */
  model?: string;
  /** Hard cap on tool-use iterations. Defaults to 25. */
  maxIterations?: number;
  /** Executes tool calls. Required. */
  executor: ToolExecutor;
  /** Optional event sink; the CLI uses this to stream NDJSON to stdout. */
  onEvent?: (event: AgentEvent) => void;
  /** Optional: override system prompt. The default is CTI-REALM-aligned. */
  systemPrompt?: string;
  /** Reserved — the SDK derives auth from the operator's Claude Code login. Ignored. */
  apiKey?: string;
  /** Max output tokens per turn. Default 4096. */
  maxTokens?: number;
};

export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_request"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; isError: boolean }
  | { type: "iteration"; n: number; stopReason: string | null }
  | { type: "model_swap"; from: string; to: string; reason: string }
  | { type: "final"; result: CtiRealmAgentResult }
  | { type: "error"; message: string };

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_TOKENS = 4096;

const DEFAULT_SYSTEM_PROMPT = `You are an elite cyber threat intelligence analyst working on the Microsoft CTI-REALM benchmark.

You will receive a detection objective derived from a CTI report. Your mission:

1. Search and analyze the relevant CTI report using the tools provided.
2. Map adversary behavior to MITRE ATT&CK techniques.
3. Discover the appropriate Kusto data sources by exploring tables and schemas.
4. Develop a working KQL query that detects the described behavior.
5. Author a Sigma rule that captures the detection logic.
6. Validate your output against the eval's schema.

Operating rules:
- Use the provided tools — do NOT invent tools or call unknown tools.
- Iterate: explore tables, refine the query, verify results.
- When you have a complete answer, respond with a single JSON object on its own (no surrounding prose):
  {
    "sigma_rule": "<YAML string with \\n line breaks>",
    "kql_query": "<KQL query>",
    "query_results": [ {"col1": "v1"}, ... ]
  }
- The Inspect AI harness scores 5 trajectory checkpoints (CTI analysis, MITRE, data exploration, query exec, detection quality). Be deliberate at every step — the scorer reads your full trajectory, not just the final JSON.
- If a tool call fails, read the error, adjust, and try again. Do not give up on the first failure.
- Stay terse in prose; spend tokens on tool calls and the final JSON.
`;

// -----------------------------------------------------------------------------
// Programmatic entry point
// -----------------------------------------------------------------------------

export async function runCtiRealmAgent(
  options: RunCtiRealmAgentOptions,
): Promise<CtiRealmAgentResult> {
  const {
    ctiReport,
    tools,
    model = DEFAULT_MODEL,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    executor,
    onEvent,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = options;

  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("runCtiRealmAgent: tools[] must be a non-empty array of CTI-REALM tool definitions.");
  }

  // claude-agent-sdk rejects duplicate tool names in a single MCP server.
  // inspect-ai's tool registry occasionally surfaces the same tool twice
  // (variant overloads, decorator vs metadata) and at least one collides
  // with the SDK's reserved name "execute". Dedupe + rename collisions.
  const RESERVED = new Set(["execute", "bash", "read", "write", "edit", "glob", "grep", "task"]);
  const seen = new Set<string>();
  const uniqueTools: CtiRealmTool[] = [];
  for (const t of tools) {
    let name = t.name;
    if (RESERVED.has(name.toLowerCase())) name = `${name}_cti`;
    if (seen.has(name)) continue; // drop dup
    seen.add(name);
    uniqueTools.push({ ...t, name });
  }

  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: ctiReport },
  ];
  let stopReason: CtiRealmAgentResult["stopReason"] = "unknown";
  let finalText = "";
  let iterationCount = 0;

  // Build an in-process MCP server whose tools forward to the executor.
  // We use a permissive Zod input schema (passthrough object) because each
  // tool's real schema is defined upstream by inspect-ai and Claude has
  // already seen it via the system prompt; we don't re-validate here.
  const passthrough = z.object({}).passthrough();
  const sdkTools = uniqueTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: passthrough.shape,
    handler: async (args: Record<string, unknown>) => {
      iterationCount += 1;
      const syntheticToolUseId = `cti_realm_${iterationCount}_${Date.now()}`;
      onEvent?.({
        type: "tool_request",
        id: syntheticToolUseId,
        name: t.name,
        input: args,
      });
      transcript.push({
        role: "assistant",
        content: `tool_use:${t.name}(${JSON.stringify(args).slice(0, 400)})`,
      });
      try {
        const { content, isError } = await executor(syntheticToolUseId, t.name, args);
        onEvent?.({ type: "tool_result", id: syntheticToolUseId, isError: !!isError });
        const text = typeof content === "string" ? content : JSON.stringify(content);
        transcript.push({ role: "user", content: `tool_result:${syntheticToolUseId} ${text.slice(0, 400)}` });
        return {
          content: [{ type: "text" as const, text }],
          isError: !!isError,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onEvent?.({ type: "tool_result", id: syntheticToolUseId, isError: true });
        transcript.push({ role: "user", content: `tool_result:${syntheticToolUseId} ERROR ${msg}` });
        return {
          content: [{ type: "text" as const, text: `Tool execution error: ${msg}` }],
          isError: true,
        };
      }
    },
  }));

  const mcpServer = createSdkMcpServer({
    name: "cti-realm-tools",
    version: "1.0.0",
    tools: sdkTools,
  });

  // Drive the SDK. The agent SDK wraps `claude -p` so it uses the operator's
  // subscription auth — no ANTHROPIC_API_KEY required.
  const stream = query({
    prompt: ctiReport,
    options: {
      model,
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt },
      mcpServers: { "cti-realm-tools": mcpServer },
      maxTurns: maxIterations,
      maxThinkingTokens: maxTokens,
      includePartialMessages: false,
      // Allow only our cti-realm tools — strip out the default Claude Code
      // toolset (Read/Bash/etc.) so the model can't escape into the host.
      allowedTools: uniqueTools.map((t) => `mcp__cti-realm-tools__${t.name}`),
    },
  });

  try {
    let assistantTurns = 0;
    for await (const msg of stream) {
      if (msg.type === "assistant") {
        assistantTurns += 1;
        onEvent?.({ type: "iteration", n: assistantTurns, stopReason: msg.message.stop_reason ?? null });
        for (const block of msg.message.content ?? []) {
          if (block.type === "text" && typeof block.text === "string") {
            onEvent?.({ type: "assistant_text", text: block.text });
            finalText = block.text;
            transcript.push({ role: "assistant", content: block.text });
          }
        }
        if (msg.message.stop_reason === "end_turn") {
          stopReason = "end_turn";
        } else if (msg.message.stop_reason === "stop_sequence") {
          stopReason = "stop_sequence";
        } else if (msg.message.stop_reason === "max_tokens") {
          stopReason = "max_iterations";
        }
      } else if (msg.type === "result") {
        // Final result event — overrides earlier provisional stopReason.
        if ("result" in msg && typeof msg.result === "string" && msg.result) {
          finalText = msg.result;
        }
        if ("subtype" in msg) {
          if (msg.subtype === "success") stopReason = stopReason === "unknown" ? "end_turn" : stopReason;
          else if (msg.subtype === "error_max_turns") stopReason = "max_iterations";
          else if (msg.subtype === "error_during_execution") stopReason = "model_error";
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stopReason = "model_error";
    onEvent?.({ type: "error", message: `Agent SDK error: ${msg}` });
    throw err;
  }

  const parsed = extractStructuredAnswer(finalText);
  const result: CtiRealmAgentResult = {
    techniques: parsed.techniques,
    dataSources: parsed.dataSources,
    kql: parsed.kql,
    sigma: parsed.sigma,
    finalText,
    transcript,
    stopReason,
  };
  onEvent?.({ type: "final", result });
  return result;
}

// -----------------------------------------------------------------------------
// Output parsing — best-effort extraction of techniques/dataSources/kql/sigma
// from the agent's final JSON. We never fail the run on parse errors; the
// scorer reads the raw transcript anyway.
// -----------------------------------------------------------------------------

function extractStructuredAnswer(text: string): {
  techniques: string[];
  dataSources: string[];
  kql: string[];
  sigma: string;
} {
  const empty = { techniques: [] as string[], dataSources: [] as string[], kql: [] as string[], sigma: "" };
  if (!text) return empty;
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return empty;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
  } catch {
    return empty;
  }
  const sigma = typeof parsed["sigma_rule"] === "string" ? (parsed["sigma_rule"] as string) : "";
  const kqlQuery = typeof parsed["kql_query"] === "string" ? (parsed["kql_query"] as string) : "";
  const kql = kqlQuery ? [kqlQuery] : [];

  const techSet = new Set<string>();
  const techRe = /\bT\d{4}(?:\.\d{3})?\b/g;
  for (const blob of [sigma, kqlQuery]) {
    let m: RegExpExecArray | null;
    while ((m = techRe.exec(blob)) !== null) techSet.add(m[0]);
  }

  const dataSet = new Set<string>();
  const kqlTableRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)/m;
  const firstTable = kqlQuery.match(kqlTableRe);
  if (firstTable) dataSet.add(firstTable[1]);
  const sigmaProductRe = /\bproduct:\s*([A-Za-z0-9_-]+)/i;
  const sigmaServiceRe = /\bservice:\s*([A-Za-z0-9_-]+)/i;
  const prod = sigma.match(sigmaProductRe);
  const svc = sigma.match(sigmaServiceRe);
  if (prod) dataSet.add(prod[1]);
  if (svc) dataSet.add(svc[1]);

  return {
    techniques: Array.from(techSet),
    dataSources: Array.from(dataSet),
    kql,
    sigma,
  };
}

// -----------------------------------------------------------------------------
// CLI bridge — spoken by `scripts/run-cti-realm.py`
// -----------------------------------------------------------------------------

type CliInitMessage = {
  type: "init";
  ctiReport: string;
  tools: CtiRealmTool[];
  model?: string;
  maxIterations?: number;
  systemPrompt?: string;
  maxTokens?: number;
};

type CliToolResultMessage = {
  type: "tool_result";
  id: string;
  content: string | ToolResultBlockContent;
  isError?: boolean;
};

type CliMessage = CliInitMessage | CliToolResultMessage;

function emit(event: AgentEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

async function runCli(): Promise<void> {
  const pendingResolvers = new Map<
    string,
    (res: { content: string | ToolResultBlockContent; isError?: boolean }) => void
  >();

  let initResolve: ((m: CliInitMessage) => void) | null = null;
  let initReject: ((err: Error) => void) | null = null;
  const initPromise = new Promise<CliInitMessage>((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
  });

  let stdinBuffer = "";
  process.stdin.on("data", (chunk: Buffer) => {
    stdinBuffer += chunk.toString("utf8");
    let nl = stdinBuffer.indexOf("\n");
    while (nl >= 0) {
      const line = stdinBuffer.slice(0, nl).trim();
      stdinBuffer = stdinBuffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          const msg = JSON.parse(line) as CliMessage;
          if (msg.type === "init") {
            if (initResolve) {
              const r = initResolve;
              initResolve = null;
              r(msg);
            }
          } else if (msg.type === "tool_result") {
            const resolve = pendingResolvers.get(msg.id);
            if (resolve) {
              pendingResolvers.delete(msg.id);
              resolve({ content: msg.content, isError: msg.isError });
            }
          }
        } catch (err) {
          emit({ type: "error", message: `bad NDJSON on stdin: ${(err as Error).message}` });
        }
      }
      nl = stdinBuffer.indexOf("\n");
    }
  });
  process.stdin.once("end", () => {
    if (initReject) initReject(new Error("stdin closed before init message arrived"));
  });

  const init = await initPromise;

  const executor: ToolExecutor = (toolUseId) =>
    new Promise((resolve) => {
      pendingResolvers.set(toolUseId, resolve);
    });

  try {
    await runCtiRealmAgent({
      ctiReport: init.ctiReport,
      tools: init.tools,
      model: init.model,
      maxIterations: init.maxIterations,
      systemPrompt: init.systemPrompt,
      maxTokens: init.maxTokens,
      executor,
      onEvent: emit,
    });
    process.exit(0);
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

const isCliEntry = (() => {
  const entry = (process.argv[1] ?? "").split(/[\\/]/).pop() ?? "";
  return entry === "agent.ts" || entry === "agent.js";
})();

if (isCliEntry) {
  const args = process.argv.slice(2);
  const wantsStdin = args.includes("--report-from-stdin") || args.includes("--tools-from-stdin");
  if (!wantsStdin) {
    process.stderr.write(
      "Usage: npx tsx src/lib/cti-realm/agent.ts --report-from-stdin --tools-from-stdin\n" +
        "  (the JSON init message is read from stdin, NDJSON events are written to stdout)\n",
    );
    process.exit(2);
  }
  runCli().catch((err) => {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
