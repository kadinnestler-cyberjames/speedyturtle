/**
 * CTI-REALM agent — drives Claude through a ReAct tool-use loop for the
 * Microsoft CTI-REALM benchmark (https://github.com/UKGovernmentBEIS/inspect_evals).
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
 *       "model": "claude-opus-4-5",
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
 * The model literal is a string ("claude-opus-4-5"); the SDK accepts arbitrary
 * model identifiers. If the API rejects it, we fall back to the latest known-good
 * Opus id and emit an `assistant_text` event noting the swap.
 */

import Anthropic from "@anthropic-ai/sdk";

// -----------------------------------------------------------------------------
// Types
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
  /** Full list of every (role, content) message exchanged in the loop. */
  transcript: Array<Anthropic.MessageParam>;
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
) => Promise<{ content: string | Anthropic.ToolResultBlockParam["content"]; isError?: boolean }>;

export type RunCtiRealmAgentOptions = {
  ctiReport: string;
  tools: CtiRealmTool[];
  /** Model literal; defaults to `claude-opus-4-5`. */
  model?: string;
  /** Hard cap on tool-use iterations. Defaults to 25. */
  maxIterations?: number;
  /** Executes tool calls. Required. */
  executor: ToolExecutor;
  /** Optional event sink; the CLI uses this to stream NDJSON to stdout. */
  onEvent?: (event: AgentEvent) => void;
  /** Optional: override system prompt. The default is CTI-REALM-aligned. */
  systemPrompt?: string;
  /** Optional: API key (defaults to ANTHROPIC_API_KEY env). */
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

const DEFAULT_MODEL = "claude-opus-4-5";
// Fallback used if the primary model literal is rejected at runtime.
const FALLBACK_MODEL = "claude-opus-4-5-20250929";
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
    apiKey = process.env.ANTHROPIC_API_KEY,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = options;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source ~/.config/secrets.env or export the key before running the CTI-REALM agent.",
    );
  }
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("runCtiRealmAgent: tools[] must be a non-empty array of CTI-REALM tool definitions.");
  }

  const client = new Anthropic({ apiKey });
  const transcript: Anthropic.MessageParam[] = [
    { role: "user", content: ctiReport },
  ];

  let activeModel = model;
  let stopReason: CtiRealmAgentResult["stopReason"] = "unknown";
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: activeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: tools as unknown as Anthropic.Tool[],
        messages: transcript,
      });
    } catch (err) {
      // If the literal model id is rejected, try the dated fallback ONCE.
      const msg = err instanceof Error ? err.message : String(err);
      if (activeModel === DEFAULT_MODEL && /model/i.test(msg) && /not.*found|invalid|unknown/i.test(msg)) {
        onEvent?.({ type: "model_swap", from: activeModel, to: FALLBACK_MODEL, reason: msg });
        activeModel = FALLBACK_MODEL;
        iter -= 1;
        continue;
      }
      stopReason = "model_error";
      onEvent?.({ type: "error", message: `Anthropic API error: ${msg}` });
      throw err;
    }

    onEvent?.({ type: "iteration", n: iter + 1, stopReason: response.stop_reason });

    // Append the assistant turn to the transcript verbatim.
    transcript.push({ role: "assistant", content: response.content });

    // Capture any text blocks for the final answer + event stream.
    for (const block of response.content) {
      if (block.type === "text") {
        onEvent?.({ type: "assistant_text", text: block.text });
        finalText = block.text; // last text block becomes the candidate final answer
      }
    }

    if (response.stop_reason === "end_turn") {
      stopReason = "end_turn";
      break;
    }

    if (response.stop_reason !== "tool_use") {
      // stop_sequence, max_tokens, refusal, etc. — terminate gracefully.
      stopReason =
        response.stop_reason === "stop_sequence" ? "stop_sequence" : "unknown";
      break;
    }

    // Execute every tool_use block in parallel and append a single user turn
    // containing all tool_result blocks (Anthropic SDK requires this shape).
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (block) => {
        onEvent?.({
          type: "tool_request",
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
        try {
          const { content, isError } = await executor(
            block.id,
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
          );
          onEvent?.({ type: "tool_result", id: block.id, isError: !!isError });
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: typeof content === "string" ? content : content,
            is_error: !!isError,
          } satisfies Anthropic.ToolResultBlockParam;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onEvent?.({ type: "tool_result", id: block.id, isError: true });
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool execution error: ${msg}`,
            is_error: true,
          } satisfies Anthropic.ToolResultBlockParam;
        }
      }),
    );

    transcript.push({ role: "user", content: toolResults });

    if (iter === maxIterations - 1) {
      stopReason = "max_iterations";
    }
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
  // Find the first top-level JSON object.
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

  // Techniques: Tnnnn / Tnnnn.nnn pulled from sigma rule + kql query text.
  const techSet = new Set<string>();
  const techRe = /\bT\d{4}(?:\.\d{3})?\b/g;
  for (const blob of [sigma, kqlQuery]) {
    let m: RegExpExecArray | null;
    while ((m = techRe.exec(blob)) !== null) techSet.add(m[0]);
  }

  // Data sources: best-effort — pull table names from the FROM/`|` segments
  // of the KQL query and from sigma `logsource:` blocks.
  const dataSet = new Set<string>();
  const kqlTableRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)/m; // first token of a KQL pipeline
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
  content: string | Anthropic.ToolResultBlockParam["content"];
  isError?: boolean;
};

type CliMessage = CliInitMessage | CliToolResultMessage;

function emit(event: AgentEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

async function runCli(): Promise<void> {
  // Stream stdin -> NDJSON messages. The first one must be `init`; subsequent
  // ones are `tool_result` payloads matched by tool_use_id.
  const pendingResolvers = new Map<
    string,
    (res: { content: string | Anthropic.ToolResultBlockParam["content"]; isError?: boolean }) => void
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

// Entry: only run the CLI when this module is executed directly (not imported).
const isCliEntry = (() => {
  // tsx + node both set process.argv[1] to the entry path.
  const entry = process.argv[1] ?? "";
  return entry.endsWith("agent.ts") || entry.endsWith("agent.js");
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
