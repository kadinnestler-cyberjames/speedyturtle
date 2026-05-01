// Smoke test for the new claude-agent-sdk-based cti-realm/agent.ts.
// Verifies it runs against the operator's Claude Code subscription with no API key.
//
// Run with: unset ANTHROPIC_API_KEY && npx tsx scripts/test-cti-realm-agent.ts

import { runCtiRealmAgent, type CtiRealmTool } from "../src/lib/cti-realm/agent";

const tools: CtiRealmTool[] = [
  {
    name: "list_kusto_tables",
    description: "List the available Kusto tables in the test telemetry database.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "submit_answer",
    description: "Submit your final answer with sigma_rule, kql_query, and query_results.",
    input_schema: {
      type: "object",
      properties: {
        sigma_rule: { type: "string" },
        kql_query: { type: "string" },
      },
      required: ["sigma_rule", "kql_query"],
    },
  },
];

const ctiReport = `Detection objective: Identify a brute-force authentication attempt against a Linux endpoint where an attacker tries 5+ failed sudo invocations from the same UID within 60 seconds.

Use list_kusto_tables to discover the schema, then submit a sigma rule and KQL query via submit_answer.`;

async function main() {
  console.log("=== test-cti-realm-agent ===");
  console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET" : "unset (will use Claude Code subscription)");
  const t0 = Date.now();

  const toolCalls: Array<{ name: string; input: unknown }> = [];

  const executor = async (toolUseId: string, toolName: string, toolInput: Record<string, unknown>) => {
    console.log(`  [tool] ${toolName}(${JSON.stringify(toolInput).slice(0, 100)})`);
    toolCalls.push({ name: toolName, input: toolInput });
    if (toolName === "list_kusto_tables") {
      return {
        content:
          "Available tables:\n- LinuxAuditEvents (columns: TimeGenerated, ProcessName, Command, ExitCode, UserId)\n- ProcessEvents",
        isError: false,
      };
    }
    if (toolName === "submit_answer") {
      return { content: "Answer accepted.", isError: false };
    }
    return { content: `Unknown tool: ${toolName}`, isError: true };
  };

  try {
    const result = await runCtiRealmAgent({
      ctiReport,
      tools,
      model: "claude-sonnet-4-6",
      maxIterations: 8,
      executor,
      onEvent: (e) => {
        if (e.type === "iteration") console.log(`  [iter ${e.n}] stop=${e.stopReason}`);
        if (e.type === "tool_request") console.log(`  [request] ${e.name}`);
        if (e.type === "error") console.log(`  [error] ${e.message}`);
      },
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("\n=== RESULT ===");
    console.log(`elapsed: ${elapsed}s`);
    console.log(`stopReason: ${result.stopReason}`);
    console.log(`tool calls: ${toolCalls.length}`);
    console.log(`techniques: ${JSON.stringify(result.techniques)}`);
    console.log(`dataSources: ${JSON.stringify(result.dataSources)}`);
    console.log(`kql length: ${result.kql.join("").length}, sigma length: ${result.sigma.length}`);
    console.log(`finalText (first 300):\n${result.finalText.slice(0, 300)}`);
    if (toolCalls.length > 0 && result.finalText) {
      console.log("\n✓ Agent ran on subscription, called tools, produced output.");
    } else {
      console.log("\n⚠ Smoke test ran but produced empty output. Inspect the logs above.");
    }
  } catch (err) {
    console.error("FAILED:", err);
    process.exit(1);
  }
}

main();
