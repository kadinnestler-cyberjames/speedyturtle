import Anthropic from "@anthropic-ai/sdk";
import type { Finding } from "../types";

/**
 * Validator subagent — Mythos's distinguishing scaffold pattern.
 *
 * Per AISLE 2026 research: "the moat in AI cybersecurity is the system, not the model."
 * Most models hallucinate vulnerabilities in already-patched code. Mythos's distinguishing
 * pattern is a fresh-context subagent that gets ONLY the suspect finding (no build context,
 * no triage, no chain reasoning) and tries to *disprove* it.
 *
 * If validator says "this is a false positive — here's why" → drop the finding.
 * If validator says "this is real and exploitable → here's the proof" → keep + flag as validated.
 * If validator can't decide → keep but mark as "unvalidated."
 */

const VALIDATOR_SYSTEM = `You are an adversarial validator. Your ONE job: try to DISPROVE the security finding you're given. You have no context other than the finding itself.

Approach each finding skeptically:
- Could this be a false positive caused by scanner heuristics?
- Could this be already mitigated by something the scanner can't see (WAF, application-layer auth, network segmentation)?
- Could the asset be a honeypot, dev/staging environment, or intentionally exposed?
- Could the CVE match be incorrect (wrong version, wrong configuration)?
- Could the URL pattern match an unrelated service?

For each finding, return ONE of:
- "validated" — finding is real and exploitable. Brief explanation of attacker impact.
- "false-positive" — explain why scanner is wrong.
- "needs-review" — can't decide without manual investigation. State what manual check is needed.

Output strict JSON:
{
  "verdicts": [
    {
      "findingId": "abc12345",
      "verdict": "validated" | "false-positive" | "needs-review",
      "reasoning": "1-2 sentences",
      "manualCheckNeeded": "if verdict is needs-review, what to check"
    }
  ]
}

Be strict. False positives waste defender time. If you can construct any reasonable doubt, mark "needs-review."`;

export type ValidationVerdict = {
  findingId: string;
  verdict: "validated" | "false-positive" | "needs-review";
  reasoning: string;
  manualCheckNeeded?: string;
};

export type ValidationResult = {
  verdicts: ValidationVerdict[];
  summary: { validated: number; falsePositive: number; needsReview: number };
};

export async function validateFindings(findings: Finding[]): Promise<ValidationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || findings.length === 0) {
    return {
      verdicts: findings.map((f) => ({
        findingId: f.id.slice(0, 8),
        verdict: "needs-review",
        reasoning: "Validator unavailable (no ANTHROPIC_API_KEY)",
      })),
      summary: { validated: 0, falsePositive: 0, needsReview: findings.length },
    };
  }

  // Only validate non-info findings (info-level not worth the tokens)
  const candidates = findings.filter((f) => f.severity !== "info").slice(0, 30);
  if (candidates.length === 0) {
    return { verdicts: [], summary: { validated: 0, falsePositive: 0, needsReview: 0 } };
  }

  const compact = candidates.map((f) => ({
    findingId: f.id.slice(0, 8),
    sev: f.severity,
    cat: f.category,
    title: f.title.slice(0, 100),
    asset: f.affectedAsset,
    cve: f.cveId,
    cvss: f.cvssScore,
    desc: f.description?.slice(0, 200),
    evidence: f.evidence?.slice(0, 200),
  }));

  const client = new Anthropic({ apiKey });

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3500,
      system: VALIDATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Validate these ${compact.length} findings:\n\n${JSON.stringify(compact, null, 2)}`,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const verdicts: ValidationVerdict[] = parsed.verdicts ?? [];
      const summary = verdicts.reduce(
        (acc, v) => {
          if (v.verdict === "validated") acc.validated++;
          else if (v.verdict === "false-positive") acc.falsePositive++;
          else acc.needsReview++;
          return acc;
        },
        { validated: 0, falsePositive: 0, needsReview: 0 }
      );
      return { verdicts, summary };
    }
  } catch (err) {
    console.error("Validator failed:", err);
  }
  return {
    verdicts: candidates.map((f) => ({
      findingId: f.id.slice(0, 8),
      verdict: "needs-review",
      reasoning: "Validator API error",
    })),
    summary: { validated: 0, falsePositive: 0, needsReview: candidates.length },
  };
}
