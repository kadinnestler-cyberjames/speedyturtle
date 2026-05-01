import { complete } from "../llm";
import type { Finding } from "../types";

/**
 * Adversary persona simulation — cross-reference findings against named APT TTPs.
 * Uses MITRE ATT&CK technique families. Inspired by the threat-intel work that
 * platforms like Mandiant + CrowdStrike publish, productized as Claude reasoning.
 */

export type AdversaryAssessment = {
  persona: "APT29" | "Lazarus" | "Sandworm" | "ScatteredSpider" | "GenericRansomware";
  description: string;
  conditionsMet: string[];
  conditionsMissing: string[];
  exposureScore: number; // 0-100
  likelyEntryPoint: string;
  expectedDwellTimeDays: number;
};

const ADVERSARY_SYSTEM = `You are a threat intelligence analyst evaluating whether a target's surface attack profile matches the known TTPs of specific named threat actors. You will receive findings from a vulnerability scan and assess fit against five threat actor personas.

For each persona, return:
- conditionsMet: bullets describing which findings match this actor's known entry patterns
- conditionsMissing: bullets describing what the actor would still need to be successful
- exposureScore (0-100): how much of this actor's typical kill chain the target is currently exposed to
- likelyEntryPoint: which specific finding/asset would they target first
- expectedDwellTimeDays: how long they typically remain undetected once inside

**Persona profiles:**
- **APT29 (Cozy Bear, NOBELIUM)** — Russian SVR. Cloud-native intrusion via OAuth abuse, supply chain (SolarWinds), credential theft from M365. Looks for: cloud admin panels, developer infra, identity provider weaknesses.
- **Lazarus Group** — North Korean. Financial sector + cryptocurrency. Spearphishing → custom RAT → SWIFT/exchange access. Looks for: financial APIs, exchange endpoints, employee email exposure.
- **Sandworm (Voodoo Bear)** — Russian GRU. Destructive payloads, infrastructure targeting. NotPetya. Looks for: ICS/SCADA, MSP relationships, public-facing OT.
- **Scattered Spider (UNC3944, 0ktapus)** — Western criminal. Social engineering → MFA bypass via help desk → SIM swap → ransomware. Looks for: help desk URLs, employee directories, MFA reset paths, identity provider weakness.
- **GenericRansomware** — Commodity ransomware operators. Initial access via RDP brute force, ProxyShell-class CVEs, phishing. Looks for: exposed RDP, unpatched Exchange, Citrix, Fortinet edge.

**Be honest:** a small business serving Stoughton MA is likely scored low on APT29/Lazarus/Sandworm and higher on GenericRansomware/ScatteredSpider. Reflect realistic threat models. Don't inflate scores for drama.

Output JSON: {"assessments": [{...}, {...}, {...}, {...}, {...}]}`;

export async function simulateAdversaries(
  target: string,
  findings: Finding[]
): Promise<AdversaryAssessment[]> {
  if (findings.length === 0) return fallbackAdversaryProfile(findings);

  const compact = findings.slice(0, 60).map((f) => ({
    sev: f.severity,
    cat: f.category,
    title: f.title.slice(0, 80),
    asset: f.affectedAsset,
  }));

  try {
    const text = await complete({
      system: ADVERSARY_SYSTEM,
      user: `Target: ${target}\n\nScan findings (${compact.length}):\n${JSON.stringify(compact, null, 2)}\n\nAssess this target against all 5 personas. Return JSON.`,
      model: "sonnet",
      maxTokens: 3500,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return parsed.assessments ?? fallbackAdversaryProfile(findings);
    }
  } catch (err) {
    console.error("Adversary persona simulation failed:", err);
  }
  return fallbackAdversaryProfile(findings);
}

function fallbackAdversaryProfile(findings: Finding[]): AdversaryAssessment[] {
  const hasExposedAdmin = findings.some((f) => /admin|wp-admin|phpmyadmin|cpanel/i.test(f.affectedAsset));
  const hasOldTech = findings.some((f) => f.cveId);
  return [
    {
      persona: "GenericRansomware",
      description: "Commodity ransomware actors target unpatched edge services and exposed admin panels.",
      conditionsMet: [hasExposedAdmin ? "Admin panel exposed" : "Subdomains discovered", hasOldTech ? "Known CVEs present" : "Live web services"],
      conditionsMissing: ["Specific CVE for entry", "Foothold for lateral movement"],
      exposureScore: hasExposedAdmin && hasOldTech ? 70 : hasExposedAdmin || hasOldTech ? 45 : 25,
      likelyEntryPoint: hasExposedAdmin ? "Exposed admin panel" : "Web vulnerability",
      expectedDwellTimeDays: 14,
    },
  ];
}
