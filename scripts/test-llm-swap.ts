// Quick verification that the Claude Code subscription LLM backend works.
// Calls validateFindings + triageFindings with synthetic findings — exercises
// the same path a real scan would, just without needing the scanner stack.
//
// Run with: npx tsx scripts/test-llm-swap.ts

import type { Finding } from "../src/lib/types";
import { validateFindings } from "../src/lib/orchestrator/validator";
import { triageFindings } from "../src/lib/orchestrator/triage";
import { simulateAdversaries } from "../src/lib/orchestrator/adversary-personas";

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
    evidence: "GET /cgi-bin/.%2e/.%2e/etc/passwd → 200 root:x:0:0:root:/root:/bin/bash",
    discoveredAt: new Date().toISOString(),
    source: "nuclei",
    templateId: "CVE-2021-41773",
  },
  {
    id: "abcd1234-2222-2222-2222-222222222222",
    severity: "medium",
    category: "misconfig",
    title: "Missing Content-Security-Policy header",
    affectedAsset: "https://example.test/",
    description: "No CSP header set on the application root.",
    recommendation: "Set a baseline CSP via reverse proxy.",
    discoveredAt: new Date().toISOString(),
    source: "nuclei",
    templateId: "missing-csp-header",
  },
  {
    id: "abcd1234-3333-3333-3333-333333333333",
    severity: "info",
    category: "service-fingerprint",
    title: "Apache server fingerprint disclosed",
    affectedAsset: "https://example.test/",
    description: "Server header reveals Apache 2.4.49.",
    recommendation: "Strip Server header at the edge.",
    discoveredAt: new Date().toISOString(),
    source: "httpx",
  },
];

async function main() {
  console.log("=== test-llm-swap ===");
  console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET (will use SDK)" : "unset (will use claude -p)");
  const t0 = Date.now();

  console.log("\n[1/3] validateFindings...");
  const v = await validateFindings(synthetic);
  console.log(`  verdicts: ${v.verdicts.length}, validated=${v.summary.validated} fp=${v.summary.falsePositive} review=${v.summary.needsReview}`);
  if (v.verdicts.length > 0) {
    console.log(`  sample: ${v.verdicts[0].findingId} = ${v.verdicts[0].verdict} — ${v.verdicts[0].reasoning.slice(0, 100)}`);
  }

  console.log("\n[2/3] triageFindings...");
  const tr = await triageFindings("example.test", synthetic);
  console.log(`  summary: ${tr.summary.slice(0, 140)}...`);
  console.log(`  topRisks: ${tr.topRisks.length}, nextSteps: ${tr.nextSteps.length}`);

  console.log("\n[3/3] simulateAdversaries...");
  const adv = await simulateAdversaries("example.test", synthetic);
  console.log(`  assessments: ${adv.length}`);
  adv.slice(0, 3).forEach((a) => {
    console.log(`  - ${a.persona}: exposure=${a.exposureScore}, entry=${a.likelyEntryPoint}`);
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== done in ${elapsed}s ===`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
