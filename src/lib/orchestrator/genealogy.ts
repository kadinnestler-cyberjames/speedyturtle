import { complete } from "../llm";
import type { Finding } from "../types";
import { heuristicGenealogy } from "./genealogy-heuristic";

/**
 * Vulnerability Genealogy — pattern-match modern findings against historical CVE families.
 *
 * Modern security tools report CVEs in isolation. Real attackers think in PATTERNS.
 * The same fundamental bug class shows up year after year with new CVE numbers,
 * because the underlying pattern is reusable (XSS via attribute, SSRF via redirect,
 * auth bypass via path normalization, etc).
 *
 * For each non-info finding, we ask Claude to:
 * - Identify the bug PATTERN (not just the specific CVE)
 * - Find 2-4 historical CVEs in the same family, going back to the earliest known instance
 * - Show how the pattern MUTATED to bypass each round of fixes
 * - Predict the next mutation an attacker might try
 *
 * No other productized tool does this. Claude can because it has the historical CVE corpus.
 */

const GENEALOGY_SYSTEM = `You are a security historian + pattern-recognition expert. You see modern CVEs as the latest mutation of bug families that span decades.

Given a list of findings, group them by BUG PATTERN (not by individual CVE), then for each pattern:

1. **Family name** — the descriptive pattern name (e.g. "URL parser disagreement → SSRF/auth bypass", "Path normalization confusion → directory traversal")
2. **Lineage** — 3-5 historical CVEs in chronological order showing pattern evolution. Examples format:
   - 2014: CVE-2014-XXXX (Shellshock) — first known instance: env-var injection via function definition syntax
   - 2017: CVE-2017-XXXX — same pattern in different parser
   - 2021: CVE-2021-XXXX — same pattern after partial fix, attacker found new bypass
   - 2024: CVE-2024-XXXX — modern variant
3. **What changed each generation** — how the pattern mutated to bypass fixes
4. **Predicted next mutation** — what an attacker would try next given current defenses
5. **Defensive lesson** — the underlying invariant that, if maintained, kills the entire family

Skip findings that don't fit a pattern (some bugs are truly one-off).

**Be honest.** If a finding doesn't have a clear historical lineage, skip it. Don't invent CVEs that don't exist. Use real CVE IDs only.

Output JSON: {
  "families": [
    {
      "familyName": "...",
      "groupedFindings": ["abc1", "def2"],
      "lineage": [{"year": "2014", "cveId": "CVE-2014-6271", "summary": "Shellshock — env var..."}],
      "evolution": "How the pattern mutated...",
      "nextMutation": "An attacker would next try...",
      "defensiveInvariant": "If you maintain X, the entire family dies"
    }
  ]
}`;

export type VulnFamily = {
  familyName: string;
  groupedFindings: string[];
  lineage: { year: string; cveId: string; summary: string }[];
  evolution: string;
  nextMutation: string;
  defensiveInvariant: string;
};

export type GenealogyOutput = {
  families: VulnFamily[];
};

export async function traceVulnerabilityGenealogy(findings: Finding[]): Promise<GenealogyOutput> {
  // Only run on findings with severity >= medium (otherwise tokens wasted on info)
  const candidates = findings
    .filter((f) => f.severity !== "info" && f.severity !== "low")
    .slice(0, 25);

  if (candidates.length === 0) return heuristicGenealogy(findings);

  const compact = candidates.map((f) => ({
    id: f.id.slice(0, 8),
    sev: f.severity,
    cat: f.category,
    title: f.title.slice(0, 100),
    cve: f.cveId,
    desc: f.description?.slice(0, 200),
  }));

  try {
    const text = await complete({
      system: GENEALOGY_SYSTEM,
      user: `Findings (${compact.length}):\n${JSON.stringify(compact, null, 2)}\n\nGroup by historical bug pattern + trace lineage. Return JSON.`,
      model: "sonnet",
      maxTokens: 4000,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const apiFamilies = parsed.families ?? [];
      if (apiFamilies.length === 0) {
        return heuristicGenealogy(findings);
      }
      return { families: apiFamilies };
    }
  } catch (err) {
    console.error("Genealogy tracing failed:", err);
  }
  return heuristicGenealogy(findings);
}
