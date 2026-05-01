import Anthropic from "@anthropic-ai/sdk";
import type { Finding } from "../types";
import { heuristicCheapestCut } from "./cheapest-cut-heuristic";

const CHAIN_SYSTEM = `You are an elite offensive security researcher in the lineage of Samuel Groß (Project Zero), James Kettle (PortSwigger), Orange Tsai (DEVCORE), and the PPP CTF team. Your distinguishing capability is **PRIMITIVE COMPOSITION** — taking individual findings that look low-severity in isolation and reasoning about how an attacker could chain them into a critical compromise.

You will receive a list of scan findings. Most look harmless individually. Your job: think 3-5 moves ahead.

For each potential exploit chain you identify, output:

1. **Title** — the attack outcome ("Full account takeover via N+1 bypass", "RCE via gadget chain")
2. **Severity** — derived from the chain outcome, not the individual finding severities
3. **Attack chain** — ordered steps showing primitive composition. Each step references which finding(s) enable it.
4. **Why scanners miss this** — what makes this chain require human/AI reasoning vs pattern-matching
5. **Defensive break-points** — where the chain breaks if ONE specific control is added (cheapest/highest-impact patch)

**Rules:**
- Be honest: if no real chain exists across the findings, return an empty array. Don't manufacture chains for impressiveness.
- Cite specific finding IDs in each step
- Think like the named researchers above:
  - **Kettle/Orange Tsai pattern:** parser disagreement + trust-boundary crossing (front-door normalizes URL, back-door doesn't → SSRF/auth bypass)
  - **PPP pattern:** combine 2+ low-impact primitives (info leak + memcorrupt + control flow)
  - **Halvar pattern:** patch gap (unpatched component + known-CVE pattern + reachable codepath)
  - **APT29 cloud-native pattern:** identity hop (subdomain + admin panel + creds in repo + lateral move via OAuth)
  - **Scattered Spider pattern:** social-engineering enabler (help desk URL + employee list + MFA reset path)
- Skip chains requiring assumed access you can't prove from the findings

**Also produce:**

After identifying chains, perform **Cheapest Cut analysis**: across ALL the chains you identified, find the SINGLE mitigation that would break the most chains at the lowest implementation cost. Examples: "set HttpOnly on session cookie" might break 3 chains. "Force MFA on /admin" might break 2 chains.

**Also generate Mermaid diagrams**: for each chain, produce a mermaid sequence diagram string showing the attack flow.

Output strict JSON:
{
  "chains": [
    {
      "id": "chain-1",
      "title": "...",
      "severity": "...",
      "attackChain": [{"step": 1, "primitive": "...", "description": "...", "usesFindings": ["abc1"]}, ...],
      "whyScannersMiss": "...",
      "defensiveBreakpoint": "...",
      "mermaid": "sequenceDiagram\\n  participant Attacker\\n  participant App\\n  Attacker->>App: ..."
    }
  ],
  "cheapestCut": {
    "mitigation": "Set HttpOnly + Secure on session cookie",
    "chainsBroken": 3,
    "implementationCost": "single config change in nginx.conf",
    "explanation": "Three of the identified chains rely on JS-accessible cookies. One config change breaks all three."
  },
  "noChainsReason": null | "explanation"
}`;

export type ExploitChain = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  attackChain: { step: number; description: string; usesFindings: string[]; primitive: string }[];
  whyScannersMiss: string;
  defensiveBreakpoint: string;
  attackerPersona?: string;
  mermaid?: string;
};

export type CheapestCut = {
  mitigation: string;
  chainsBroken: number;
  implementationCost: string;
  explanation: string;
};

export type ChainReasoningOutput = {
  chains: ExploitChain[];
  cheapestCut?: CheapestCut | null;
  noChainsReason?: string | null;
};

export async function reasonAboutChains(
  target: string,
  findings: Finding[]
): Promise<ChainReasoningOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const h = heuristicCheapestCut(findings);
    return {
      chains: h.syntheticChains,
      cheapestCut: h.cheapestCut,
      noChainsReason: h.syntheticChains.length === 0
        ? "ANTHROPIC_API_KEY not set — no patterns matched the heuristic chain library."
        : "ANTHROPIC_API_KEY not set — chains below were composed by heuristic pattern-match, not Claude. Add the key for full multi-step reasoning.",
    };
  }
  if (findings.length < 2) {
    return { chains: [], noChainsReason: "Only one finding — nothing to compose into a chain." };
  }

  // Send only the most useful subset
  const scoped = findings
    .filter((f) => f.severity !== "info" || f.category === "subdomain-exposure" || f.category === "service-fingerprint")
    .slice(0, 80)
    .map((f) => ({
      id: f.id.slice(0, 8),
      sev: f.severity,
      cat: f.category,
      title: f.title.slice(0, 100),
      asset: f.affectedAsset,
      desc: f.description?.slice(0, 200),
      cve: f.cveId,
      cvss: f.cvssScore,
    }));

  if (scoped.length < 2) {
    return { chains: [], noChainsReason: "Not enough findings to compose chains from" };
  }

  const client = new Anthropic({ apiKey });

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-5-20250929",
      max_tokens: 4000,
      system: CHAIN_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Target: ${target}\n\nFindings (${scoped.length}):\n${JSON.stringify(scoped, null, 2)}\n\nReason about composable attack chains. Return JSON.`,
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
      const apiChains = (parsed.chains ?? []).map((c: ExploitChain, i: number) => ({
        ...c,
        id: c.id ?? `chain-${i + 1}`,
      }));
      const apiCut = parsed.cheapestCut ?? null;
      // Fill in via heuristic if Claude returned nothing actionable
      if (apiChains.length === 0 && !apiCut) {
        const h = heuristicCheapestCut(findings);
        if (h.cheapestCut || h.syntheticChains.length > 0) {
          return {
            chains: h.syntheticChains,
            cheapestCut: h.cheapestCut,
            noChainsReason: "Claude found no composable chains; heuristic surfaced common-pattern chains and cheapest-cut from the findings.",
          };
        }
      }
      return {
        chains: apiChains,
        cheapestCut: apiCut,
        noChainsReason: parsed.noChainsReason ?? null,
      };
    }
  } catch (err) {
    console.error("Chain reasoning failed:", err);
  }
  // Final fallback: heuristic
  const h = heuristicCheapestCut(findings);
  return {
    chains: h.syntheticChains,
    cheapestCut: h.cheapestCut,
    noChainsReason: "Claude API call failed — falling back to heuristic chain pattern-match.",
  };
}
