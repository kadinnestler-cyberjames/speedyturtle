// End-to-end verification that every speedyturtle LLM call site works against
// the operator's Claude subscription via `claude -p` (no ANTHROPIC_API_KEY).
// Calls each orchestrator + blue-team module with synthetic findings.
//
// Run with: npx tsx scripts/test-llm-swap.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Finding, Scan } from "../src/lib/types";
import { validateFindings } from "../src/lib/orchestrator/validator";
import { triageFindings } from "../src/lib/orchestrator/triage";
import { reasonAboutChains } from "../src/lib/orchestrator/chain-reasoning";
import { traceVulnerabilityGenealogy } from "../src/lib/orchestrator/genealogy";
import { simulateAdversaries } from "../src/lib/orchestrator/adversary-personas";
import { generateHardeningPlan } from "../src/lib/blue-team/hardening";

const synthetic: Finding[] = [
  {
    id: "abcd1234-1111-1111-1111-111111111111",
    severity: "high",
    category: "vulnerability",
    title: "Apache HTTP Server 2.4.49 path traversal (CVE-2021-41773)",
    affectedAsset: "https://example.test/cgi-bin/",
    description: "Apache 2.4.49 path normalization flaw allowing access to files outside DocumentRoot.",
    recommendation: "Upgrade to Apache 2.4.51 or apply vendor patch.",
    cveId: "CVE-2021-41773",
    cvssScore: 9.8,
    evidence: "GET /cgi-bin/.%2e/.%2e/etc/passwd -> 200 root:x:0:0:root:/root:/bin/bash",
    scanner: "nuclei",
  },
  {
    id: "abcd1234-2222-2222-2222-222222222222",
    severity: "medium",
    category: "misconfig",
    title: "Missing Content-Security-Policy header",
    affectedAsset: "https://example.test/",
    description: "No CSP header set on the application root.",
    recommendation: "Set a baseline CSP via reverse proxy.",
    scanner: "nuclei",
  },
  {
    id: "abcd1234-3333-3333-3333-333333333333",
    severity: "info",
    category: "service-fingerprint",
    title: "Apache server fingerprint disclosed",
    affectedAsset: "https://example.test/",
    description: "Server header reveals Apache 2.4.49.",
    recommendation: "Strip Server header at the edge.",
    scanner: "httpx",
  },
];

const stage = (label: string) => {
  console.log(`\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}`);
};

async function main() {
  console.log("=== speedyturtle LLM swap — full pipeline test ===");
  console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET (using Anthropic SDK)" : "unset (using `claude -p` subscription)");
  const t0 = Date.now();
  const evidence: Record<string, unknown> = { startedAt: new Date().toISOString() };

  stage("[1/6] validateFindings (sonnet)");
  const v = await validateFindings(synthetic);
  console.log(`  -> ${v.verdicts.length} verdicts, validated=${v.summary.validated} fp=${v.summary.falsePositive} review=${v.summary.needsReview}`);
  if (v.verdicts[0]) console.log(`  reasoning: ${v.verdicts[0].reasoning.slice(0, 140)}`);
  evidence.validation = v;

  stage("[2/6] triageFindings (sonnet)");
  const tr = await triageFindings("example.test", synthetic);
  console.log(`  summary: ${tr.summary.slice(0, 200)}`);
  console.log(`  topRisks: ${tr.topRisks.length}, nextSteps: ${tr.nextSteps.length}`);
  evidence.triage = tr;

  stage("[3/6] reasonAboutChains (opus, with mermaid)");
  const cr = await reasonAboutChains("example.test", synthetic);
  console.log(`  -> ${cr.chains.length} chains`);
  cr.chains.slice(0, 2).forEach((c) => {
    console.log(`  - ${c.title} [${c.severity}], steps=${c.attackChain.length}, mermaid=${c.mermaid ? "yes" : "no"}`);
  });
  if (cr.cheapestCut) console.log(`  cheapestCut: ${cr.cheapestCut.mitigation} (breaks ${cr.cheapestCut.chainsBroken} chains)`);
  evidence.chains = cr;

  stage("[4/6] traceVulnerabilityGenealogy (sonnet)");
  const gen = await traceVulnerabilityGenealogy(synthetic);
  console.log(`  -> ${gen.families.length} families`);
  gen.families.slice(0, 2).forEach((f) => {
    console.log(`  - ${f.familyName}: ${f.lineage.length} lineage entries`);
  });
  evidence.genealogy = gen;

  stage("[5/6] simulateAdversaries (sonnet)");
  const adv = await simulateAdversaries("example.test", synthetic);
  console.log(`  -> ${adv.length} persona assessments`);
  adv.slice(0, 5).forEach((a) => {
    console.log(`  - persona=${a.persona ?? "?"}, exposure=${a.exposureScore}, dwell=${a.expectedDwellTimeDays}d`);
  });
  evidence.adversaries = adv;

  stage("[6/6] generateHardeningPlan (sonnet patches + opus chain breakpoints)");
  const synthScan: Scan = {
    id: "test-scan-llm-swap",
    input: { target: "example.test", mode: "blue-team", email: "demo@example.test", authorizationConfirmed: true },
    status: "ready",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    findings: synthetic,
    exploitChains: cr.chains,
    progress: { step: "done", pct: 100, message: "synthetic" },
  };
  const hp = await generateHardeningPlan(synthScan);
  console.log(`  -> ${hp.patches.length} patches (${hp.patches.filter((p) => p.source === "claude").length} via claude)`);
  console.log(`  -> ${hp.chainBreakpoints.length} chain breakpoints`);
  console.log(`  quickWins=${hp.summary.quickWins}, estHrs=${hp.summary.estimatedEffortHours}`);
  evidence.hardening = hp;

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== completed in ${elapsed}s ===`);
  evidence.completedAt = new Date().toISOString();
  evidence.elapsedSec = Number(elapsed);

  // Persist for screenshot/proof.
  mkdirSync(join(process.cwd(), "data", "llm-swap-evidence"), { recursive: true });
  const out = join(process.cwd(), "data", "llm-swap-evidence", "run-" + Date.now() + ".json");
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(`Evidence dumped: ${out}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
