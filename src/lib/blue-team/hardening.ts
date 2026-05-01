import Anthropic from "@anthropic-ai/sdk";
import type { Finding, Scan, ExploitChain } from "../types";
import type {
  HardeningPlan,
  PatchSuggestion,
  PatchEffort,
  ChainBreakpoint,
  ComplianceImpactItem,
  ComplianceFrameworkSlug,
} from "./types";
import {
  COMPLIANCE_FRAMEWORKS,
  mapFindingToControls,
} from "./compliance";

const PATCH_SYSTEM = `You are a senior platform/security engineer who patches things for a living. Given a security finding, write a single, specific, actionable patch suggestion.

Rules:
- One paragraph max. No fluff. No "leverage," "robust," "comprehensive."
- Reference the affected asset and CVE/template ID by name when present.
- Prefer concrete config snippets / exact commands when applicable (e.g., "Add 'server_tokens off;' to nginx.conf and reload").
- Estimate effort honestly: "low" (config tweak under 30 min), "medium" (work day), "high" (multi-day or coordinated rollout).
- Output strict JSON only: {"patch": "...", "effort": "low|medium|high"}`;

const CHAIN_BP_SYSTEM = `You are a defensive security architect. Given an exploit chain (multiple primitives composed into one attack), pick the SINGLE highest-leverage break-point — the one control change that kills the chain at its narrowest waist.

Rules:
- Identify which step in the chain is the "narrowest waist" — where one control breaks all downstream steps.
- Be specific about the mechanism (header, config flag, code change, network rule).
- Estimate effort: "low" (single config), "medium" (small code/infra change), "high" (architecture shift).
- If the supplied chain.defensiveBreakpoint is already excellent, sharpen it; do not invent a worse one.
- Output strict JSON only: {"breakpoint": "...", "rationale": "...", "effort": "low|medium|high", "cutsChainAtStep": <step-number-or-null>}`;

export async function generateHardeningPlan(scan: Scan): Promise<HardeningPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const actionable = scan.findings.filter((f) => f.severity !== "info" || f.category === "subdomain-exposure");

  const patches = await generatePatches(actionable, client);
  const chainBreakpoints = await generateChainBreakpoints(scan.exploitChains ?? [], client);
  const complianceImpact = generateComplianceImpact(actionable);

  const quickWins = patches.filter((p) => p.effort === "low" && (p.severity === "high" || p.severity === "critical")).length;
  const estimatedEffortHours = patches.reduce((acc, p) => {
    if (p.effort === "low") return acc + 0.5;
    if (p.effort === "medium") return acc + 4;
    return acc + 16;
  }, 0);

  return {
    scanId: scan.id,
    generatedAt: new Date().toISOString(),
    target: scan.input.target,
    patches,
    chainBreakpoints,
    complianceImpact,
    summary: {
      patchCount: patches.length,
      chainCount: chainBreakpoints.length,
      quickWins,
      estimatedEffortHours,
    },
  };
}

async function generatePatches(
  findings: Finding[],
  client: Anthropic | null
): Promise<PatchSuggestion[]> {
  const prioritized = [...findings].sort(severityRank);
  const out: PatchSuggestion[] = [];
  let priority = 1;

  const claudeBudget = 12;
  for (const f of prioritized) {
    let patch: string | null = null;
    let effort: PatchEffort = "medium";
    let source: PatchSuggestion["source"] = "fallback";

    if (client && priority <= claudeBudget && f.severity !== "info") {
      const result = await tryClaudePatch(client, f);
      if (result) {
        patch = result.patch;
        effort = result.effort;
        source = "claude";
      }
    }

    if (!patch) {
      const fb = fallbackPatch(f);
      patch = fb.patch;
      effort = fb.effort;
    }

    out.push({
      findingId: f.id,
      title: f.title,
      affectedAsset: f.affectedAsset,
      severity: f.severity,
      category: f.category,
      patch,
      effort,
      priority: priority++,
      source,
    });
  }

  return out;
}

async function tryClaudePatch(
  client: Anthropic,
  finding: Finding
): Promise<{ patch: string; effort: PatchEffort } | null> {
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: PATCH_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            description: finding.description?.slice(0, 400),
            affectedAsset: finding.affectedAsset,
            cveId: finding.cveId,
            cvssScore: finding.cvssScore,
            recommendation: finding.recommendation,
          }),
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const patch = typeof parsed.patch === "string" ? parsed.patch.trim() : null;
    const effort = ["low", "medium", "high"].includes(parsed.effort) ? (parsed.effort as PatchEffort) : "medium";
    if (!patch) return null;
    return { patch, effort };
  } catch (err) {
    console.error("Claude patch failed for finding", finding.id, err);
    return null;
  }
}

function fallbackPatch(f: Finding): { patch: string; effort: PatchEffort } {
  const asset = f.affectedAsset;
  const rec = f.recommendation ?? "";
  const cve = f.cveId;
  const tpl = (f.title || "").trim();

  switch (f.category) {
    case "subdomain-exposure":
      return {
        patch: `Verify ${asset} is intentional. Decommission if it's a stale dev/staging environment. Add to your asset inventory.`,
        effort: "low",
      };
    case "service-fingerprint":
      return {
        patch: `Add Server and X-Powered-By header stripping at the edge (nginx: 'server_tokens off;'). Confirm ${asset} is intentional public surface.`,
        effort: "low",
      };
    case "vulnerability":
      if (cve) {
        return {
          patch: `Patch ${cve}. ${rec || "Upgrade affected component to a fixed version per vendor advisory."}`,
          effort: f.severity === "critical" ? "medium" : "medium",
        };
      }
      return {
        patch: `Apply vendor-recommended remediation for ${tpl}. ${rec || ""}`.trim(),
        effort: "medium",
      };
    case "misconfig":
      return {
        patch: `Apply hardening: ${tpl}. ${rec || "See vendor docs for the secure default."}`.trim(),
        effort: "low",
      };
    case "tls":
      return {
        patch: `Disable weak ciphers and protocols (<TLS 1.2). Renew certificate if expired. Use Mozilla 'Intermediate' profile.`,
        effort: "low",
      };
    case "info-disclosure":
      return {
        patch: `Remove or restrict access to ${asset}. Confirm no sensitive content is leaked.`,
        effort: "low",
      };
    case "credential-exposure":
      return {
        patch: `Rotate credentials immediately. Revoke leaked tokens. Audit access logs for this asset.`,
        effort: "high",
      };
    default:
      return {
        patch: `Investigate ${tpl} on ${asset} and apply vendor guidance.`,
        effort: "medium",
      };
  }
}

async function generateChainBreakpoints(
  chains: ExploitChain[],
  client: Anthropic | null
): Promise<ChainBreakpoint[]> {
  if (chains.length === 0) return [];
  const out: ChainBreakpoint[] = [];

  for (const chain of chains) {
    if (client) {
      const result = await tryOpusBreakpoint(client, chain);
      if (result) {
        out.push({
          chainId: chain.id,
          chainTitle: chain.title,
          breakpoint: result.breakpoint,
          rationale: result.rationale,
          effort: result.effort,
          cutsChainAtStep: result.cutsChainAtStep ?? undefined,
          source: "opus",
        });
        continue;
      }
    }
    out.push({
      chainId: chain.id,
      chainTitle: chain.title,
      breakpoint: chain.defensiveBreakpoint,
      rationale: `Heuristic from chain reasoning output for ${chain.title}.`,
      effort: "medium",
      source: "fallback",
    });
  }

  return out;
}

async function tryOpusBreakpoint(
  client: Anthropic,
  chain: ExploitChain
): Promise<{ breakpoint: string; rationale: string; effort: PatchEffort; cutsChainAtStep: number | null } | null> {
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-5-20250929",
      max_tokens: 800,
      system: CHAIN_BP_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            title: chain.title,
            severity: chain.severity,
            steps: chain.attackChain.map((s) => ({ step: s.step, primitive: s.primitive, description: s.description })),
            existingBreakpoint: chain.defensiveBreakpoint,
            whyScannersMiss: chain.whyScannersMiss,
          }),
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const breakpoint = typeof parsed.breakpoint === "string" ? parsed.breakpoint.trim() : null;
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
    const effort = ["low", "medium", "high"].includes(parsed.effort) ? (parsed.effort as PatchEffort) : "medium";
    const cutsAt = typeof parsed.cutsChainAtStep === "number" ? parsed.cutsChainAtStep : null;
    if (!breakpoint) return null;
    return { breakpoint, rationale, effort, cutsChainAtStep: cutsAt };
  } catch (err) {
    console.error("Opus breakpoint failed for chain", chain.id, err);
    return null;
  }
}

function generateComplianceImpact(findings: Finding[]): ComplianceImpactItem[] {
  const out: ComplianceImpactItem[] = [];
  const slugs: ComplianceFrameworkSlug[] = COMPLIANCE_FRAMEWORKS.map((f) => f.slug);
  for (const f of findings) {
    for (const slug of slugs) {
      const controls = mapFindingToControls(f, slug);
      if (controls.length === 0) continue;
      out.push({
        findingId: f.id,
        findingTitle: f.title,
        severity: f.severity,
        affectedAsset: f.affectedAsset,
        framework: slug,
        controlIds: controls,
      });
    }
  }
  return out;
}

const SEV_RANK: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function severityRank(a: Finding, b: Finding): number {
  return SEV_RANK[a.severity] - SEV_RANK[b.severity];
}
