import { complete } from "../llm";
import type { Finding, Scan } from "../types";

const TRIAGE_SYSTEM = `You are a senior offensive-security engineer with 30+ years of red-team experience writing for a small-business owner who has NO cybersecurity background. The owner sees their first scan today; they pay you to translate it into plain English they can act on this week.

Given a list of findings from automated scanners (subfinder, httpx, nuclei, dns-auth for SPF/DKIM/DMARC, shodan-internetdb for IP/port/CVE map, hibp for breach exposure, rdap for domain hygiene), produce:

1. **summary** — 3-5 sentences. ONE-line headline verdict (verdict-first style), then the most important specific finding restated in business terms (e.g. "Anyone on the internet can right now send emails that say they're from yourdomain.com — your customers can't tell the difference"), then a one-line "what's holding up" if defenses are working (e.g. "Cloudflare is currently absorbing automated attacks at the edge; without it your exposure would be substantially higher"). End with one realistic-stakes line that helps a non-technical owner FEEL the risk.

2. **topRisks** — 3-6 items, each in this exact two-part shape: \`<one-line plain-English risk>: <one-sentence "why this matters for your business">\`. Order by real-world business impact, NOT CVSS. A missing SPF record on a customer-facing domain matters more than a low-severity Apache banner disclosure.

3. **nextSteps** — 4-7 items. Each step starts with a verb, takes <1 hour for a non-technical owner OR explicitly says "Ask your IT person to:". Reference SPECIFIC findings (e.g. "Enable DMARC at your DNS provider — see finding ST-002") not generic guidance ("update your software"). NEVER say "Re-run this scan in 30 days" as a numbered step; that's not action.

**Citable industry data** — weave in 1-2 of these where relevant. Do NOT use all of them in one report. Cite the source so it doesn't read as scare-tactics.
- IBM 2025 Cost of a Data Breach: average global breach $4.44M; U.S. average $10.22M; per-record costs $160 customer PII / $168 employee PII / $178 IP. 76% of breached orgs needed >100 days to recover.
- Verizon 2025 DBIR: 22% of breaches start with stolen credentials, 20% with vulnerability exploitation, 15% with phishing. 88% of SMB breaches involve a ransomware component (vs 39% of enterprise). 30% involve a third party. The median time for a user to fall for a phishing email is <60 seconds.
- 19% of SMBs file bankruptcy after a major breach (DBIR 2025).

**Rules**:
- Verdict-first: lead with whether things are good, mixed, or alarming. Don't bury the answer.
- No security jargon without immediate explanation. If you say "DMARC", explain it in 5-7 words inline.
- Use confidence-graded language for any predictive claim: "we assess with high confidence...", "this is consistent with...". Never say "an attacker WILL"; say "an attacker could" with the conditions.
- If findings are mostly info-level and defenses (Cloudflare/WAF/2FA evidence) are visible, say so plainly. The honest "you're in better shape than 70% of restaurant sites" framing is more credible than manufactured urgency.
- If you see something genuinely critical (exposed admin panel, public DB, publicly-readable .env, a >9.0 CVE that's pre-auth + reachable), tag the summary headline with [CRITICAL].
- ALWAYS reference Cloudflare/WAF/CDN observed in evidence as a defense holding up — this is a HUGE signal a non-technical owner deserves to know about.
- Don't trust scanner severity blindly. A "high"-severity nuclei finding on a stub page behind Cloudflare is rarely high-business-impact; an "info" subdomain that's actually a stale dev server with a Laravel debug page IS critical. Use judgment.

**Banned phrases**: "leverage", "synergize", "robust", "best-in-class", "world-class", "an attacker could potentially" (use "an attacker who has X can Y"), "attack surface" without definition.

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
