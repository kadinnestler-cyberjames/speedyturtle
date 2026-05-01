import { complete } from "../llm";
import type { Finding, Scan } from "../types";

const TRIAGE_SYSTEM = `You are an experienced offensive security engineer (red team) writing a triage summary for a small business owner who is NOT a security person.

Given a list of findings from automated scanners (subfinder, httpx, nuclei), produce:

1. A 2-3 sentence plain-English summary of the security posture
2. The top 3-5 risks ordered by real-world impact (not just CVSS score) — explain in business terms what an attacker could DO with each
3. A concrete next-steps list: 4-7 items the owner can act on this week, ordered by priority

Rules:
- No security jargon without immediate explanation
- No buzzwords like "leverage," "synergize," "robust"
- If findings are mostly "info" with no real exploits, say so plainly — don't manufacture urgency
- If you see something genuinely critical (RCE, exposed credentials, public admin panels), call it out at the top with [CRITICAL]
- Be honest about scanner limitations — these are surface scans, not deep audits

Output strict JSON: {"summary": "...", "topRisks": ["..."], "nextSteps": ["..."]}`;

export async function triageFindings(
  target: string,
  findings: Finding[]
): Promise<NonNullable<Scan["triage"]>> {
  if (findings.length === 0) {
    return fallbackTriage(target, findings);
  }

  // Compact findings for the prompt
  const compact = findings
    .filter((f) => f.severity !== "info")
    .slice(0, 50)
    .map((f) => ({
      sev: f.severity,
      cat: f.category,
      title: f.title,
      asset: f.affectedAsset,
      cve: f.cveId,
      cvss: f.cvssScore,
    }));

  if (compact.length === 0) {
    return fallbackTriage(target, findings);
  }

  try {
    const text = await complete({
      system: TRIAGE_SYSTEM,
      user: `Target: ${target}\n\nFindings (${compact.length}, info-level omitted):\n${JSON.stringify(compact, null, 2)}\n\nReturn the JSON.`,
      model: "sonnet",
      maxTokens: 2000,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return {
        summary: parsed.summary || fallbackTriage(target, findings).summary,
        topRisks: parsed.topRisks ?? [],
        nextSteps: parsed.nextSteps ?? [],
      };
    }
  } catch (err) {
    console.error("Claude triage failed:", err);
  }
  return fallbackTriage(target, findings);
}

function fallbackTriage(target: string, findings: Finding[]): NonNullable<Scan["triage"]> {
  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");
  const med = findings.filter((f) => f.severity === "medium");
  const subdomainCount = findings.filter((f) => f.category === "subdomain-exposure").length;
  const liveCount = findings.filter((f) => f.category === "service-fingerprint").length;

  const summary =
    critical.length + high.length === 0
      ? `Surface-level scan of ${target} found ${subdomainCount} subdomain(s), ${liveCount} live HTTP service(s), and no critical or high-severity vulnerabilities. ${med.length} medium-severity issues warrant follow-up.`
      : `Surface-level scan of ${target} surfaced ${critical.length} critical and ${high.length} high-severity issues out of ${findings.length} total findings. Recommend addressing critical/high items this week.`;

  const topRisks = [...critical, ...high, ...med].slice(0, 5).map((f) => `${f.severity.toUpperCase()}: ${f.title} on ${f.affectedAsset}`);

  const nextSteps = [
    critical.length > 0 ? `Patch the ${critical.length} critical-severity issue(s) immediately.` : null,
    high.length > 0 ? `Schedule a maintenance window to address ${high.length} high-severity issue(s) this week.` : null,
    `Review the ${subdomainCount} discovered subdomains and decommission anything unused.`,
    `Verify all live HTTP services are intentional and not forgotten dev/staging environments.`,
    `Re-run this scan in 30 days to track progress.`,
    `Subscribe to a CVE feed for the technologies detected (see scan details).`,
  ].filter((s): s is string => s !== null);

  return { summary, topRisks, nextSteps };
}
