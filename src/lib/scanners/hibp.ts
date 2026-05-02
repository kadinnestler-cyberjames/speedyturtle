/**
 * Have I Been Pwned domain breach exposure check.
 *
 * https://haveibeenpwned.com/api/v3/breaches?domain={domain}
 * Free tier: no API key required for the breaches-by-domain endpoint
 * (some HIBP endpoints require a paid key — this one does not).
 *
 * Each breach affecting addresses on the domain becomes a finding. The
 * description names the breach, the count of affected accounts (if HIBP
 * exposes it for the domain), the data classes leaked, and the date.
 */

export type HibpFinding = {
  category: "breach-exposure";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommendation: string;
  shortTermFix: string;
  longTermFix: string;
  affectedAsset: string;
  evidence?: string;
};

type HibpBreach = {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string; // HTML
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
};

function severityFor(breach: HibpBreach): HibpFinding["severity"] {
  const dc = breach.DataClasses.map((c) => c.toLowerCase());
  if (dc.includes("passwords") || dc.includes("password hashes") || dc.includes("password hints")) return "high";
  if (dc.includes("credit card cvv") || dc.includes("credit cards") || dc.includes("partial credit card data")) return "high";
  if (dc.includes("government issued ids") || dc.includes("social security numbers") || dc.includes("bank account numbers")) return "high";
  if (dc.includes("phone numbers") || dc.includes("physical addresses") || dc.includes("dates of birth")) return "medium";
  return "low";
}

function stripHtml(s: string): string {
  return s
    .replace(/<a [^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<br ?\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runHibpScan(domain: string): Promise<HibpFinding[]> {
  const findings: HibpFinding[] = [];
  const bare = domain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!bare) return findings;

  let breaches: HibpBreach[] = [];
  try {
    const res = await fetch(`https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(bare)}`, {
      headers: {
        // HIBP requires a UA per their docs.
        "User-Agent": "speedyturtle-scanner/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return findings;
    breaches = (await res.json()) as HibpBreach[];
  } catch {
    return findings;
  }

  if (!Array.isArray(breaches) || breaches.length === 0) {
    findings.push({
      category: "breach-exposure",
      severity: "info",
      title: "No breaches affecting this domain found in Have I Been Pwned",
      description: `HIBP indexes the major public credential leaks (LinkedIn, Adobe, Dropbox, etc.). Right now ${bare} is not associated with any breach in the index.`,
      recommendation: "Re-run this scan monthly — new breaches are added regularly.",
      shortTermFix: "Sign up for free HIBP domain alerts at https://haveibeenpwned.com/DomainSearch — you'll get notified the moment a future breach matches your domain.",
      longTermFix: "Enforce password rotation + 2FA on every business account. HIBP detects breaches AFTER they're public; the only reliable defense is making each leaked password useless for re-use.",
      affectedAsset: bare,
      evidence: "HIBP /api/v3/breaches?domain= returned 0 results",
    });
    return findings;
  }

  for (const b of breaches) {
    const sev = severityFor(b);
    const dataClasses = b.DataClasses.join(", ");
    findings.push({
      category: "breach-exposure",
      severity: sev,
      title: `${b.Title} breach (${new Date(b.BreachDate).toLocaleDateString()}) — affects ${b.PwnCount.toLocaleString()} accounts`,
      description: `Have I Been Pwned reports a breach involving ${b.Domain} on ${b.BreachDate}. Data classes exposed: ${dataClasses}.\n\n${stripHtml(b.Description).slice(0, 400)}`,
      recommendation: `Force password reset for any account linked to a ${b.Domain} address. If passwords were leaked in cleartext or weak hashes, treat any reuse of that password elsewhere as compromised.`,
      shortTermFix: `Email every staff member who may have used a ${b.Domain} address: rotate any password reused with this email + enable 2FA on every business-critical service. Use https://haveibeenpwned.com/PwnedWebsites/${b.Name} to read the full breach detail.`,
      longTermFix: `Adopt a password manager for the whole team (1Password, Bitwarden) so password reuse becomes mechanically impossible. Set a 90-day reminder to recheck HIBP for new breaches affecting your domain.`,
      affectedAsset: bare,
      evidence: `HIBP breach record: name=${b.Name}, addedDate=${b.AddedDate}, verified=${b.IsVerified}`,
    });
  }

  return findings;
}
