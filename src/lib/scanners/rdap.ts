/**
 * Domain registration / WHOIS hygiene check via RDAP.
 *
 * RDAP is the modern WHOIS — JSON-over-HTTPS, no rate-limit games,
 * no CAPTCHA. https://rdap.verisign.com/com/v1/domain/{domain} works for
 * .com/.net; other TLDs have their own RDAP servers we resolve via the
 * IANA bootstrap registry.
 */

export type RdapFinding = {
  category: "domain-hygiene";
  severity: "info" | "low" | "medium" | "high";
  title: string;
  description: string;
  recommendation: string;
  shortTermFix: string;
  longTermFix: string;
  affectedAsset: string;
  evidence?: string;
};

type RdapResponse = {
  events?: { eventAction: string; eventDate: string }[];
  status?: string[];
  entities?: { roles: string[]; vcardArray?: unknown[]; remarks?: { description?: string[] }[] }[];
  remarks?: { description?: string[] }[];
};

function getEvent(rdap: RdapResponse, action: string): Date | null {
  const ev = rdap.events?.find((e) => e.eventAction === action);
  if (!ev) return null;
  const d = new Date(ev.eventDate);
  return isNaN(d.getTime()) ? null : d;
}

async function bootstrapRdapBase(tld: string): Promise<string> {
  // Hard-code the most common TLDs to skip the bootstrap roundtrip.
  const known: Record<string, string> = {
    com: "https://rdap.verisign.com/com/v1",
    net: "https://rdap.verisign.com/net/v1",
    org: "https://rdap.publicinterestregistry.org",
    io: "https://rdap.identitydigital.services/rdap",
    dev: "https://www.registry.google/rdap",
    app: "https://www.registry.google/rdap",
    ai: "https://rdap.identitydigital.services/rdap",
  };
  if (known[tld]) return known[tld];
  // Fallback: IANA bootstrap.
  try {
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return "https://rdap.verisign.com/com/v1"; // best-effort
    const j = (await res.json()) as { services: [string[], string[]][] };
    for (const [tlds, urls] of j.services) {
      if (tlds.includes(tld) && urls.length > 0) {
        return urls[0].replace(/\/$/, "");
      }
    }
  } catch {
    // ignore
  }
  return "https://rdap.verisign.com/com/v1";
}

export async function runRdapScan(domain: string): Promise<RdapFinding[]> {
  const findings: RdapFinding[] = [];
  const bare = domain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!bare || !bare.includes(".")) return findings;

  const tld = bare.split(".").pop() ?? "";
  const base = await bootstrapRdapBase(tld);

  let rdap: RdapResponse;
  try {
    const res = await fetch(`${base}/domain/${bare}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/rdap+json" },
    });
    if (!res.ok) return findings;
    rdap = (await res.json()) as RdapResponse;
  } catch {
    return findings;
  }

  // Expiry check
  const expiry = getEvent(rdap, "expiration");
  if (expiry) {
    const daysToExpiry = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
    if (daysToExpiry < 30) {
      findings.push({
        category: "domain-hygiene",
        severity: "high",
        title: `Domain expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"} (${expiry.toLocaleDateString()})`,
        description: `${bare} expires very soon. If the renewal lapses, an attacker can register the dropped domain and impersonate your business — including receiving your email, MX, and SSL re-issuance flows.`,
        recommendation: "Enable auto-renew at your registrar TODAY. Add a calendar reminder + a backup payment method.",
        shortTermFix: "Log into your registrar (the company you bought the domain from) → Domain settings → Enable Auto-Renew → Verify the credit card on file. Takes 2 minutes.",
        longTermFix: "Move to a multi-year renewal (5–10 years) and consolidate all business domains under one registrar account with multiple authorized contacts.",
        affectedAsset: bare,
        evidence: `RDAP expiration: ${expiry.toISOString()}`,
      });
    } else if (daysToExpiry < 90) {
      findings.push({
        category: "domain-hygiene",
        severity: "medium",
        title: `Domain expires in ${daysToExpiry} days (${expiry.toLocaleDateString()})`,
        description: `${bare} expires in ${daysToExpiry} days. Plenty of runway, but worth confirming auto-renew is enabled and the payment method on file is current.`,
        recommendation: "Verify auto-renew is on; confirm registrar payment method.",
        shortTermFix: "Log into your registrar and verify auto-renew is on with a current credit card.",
        longTermFix: "Renew for multiple years (5–10) to remove this risk class entirely.",
        affectedAsset: bare,
        evidence: `RDAP expiration: ${expiry.toISOString()}`,
      });
    }
  }

  // Registrar lock status (look for client/server transfer prohibition flags)
  const status = rdap.status ?? [];
  const lockedFlags = ["client transfer prohibited", "server transfer prohibited", "clienttransferprohibited", "servertransferprohibited"];
  const hasLock = status.some((s) => lockedFlags.includes(s.toLowerCase()));
  if (!hasLock) {
    findings.push({
      category: "domain-hygiene",
      severity: "high",
      title: "Registrar transfer lock is OFF — domain hijack risk",
      description: `${bare} does not have a registrar transfer lock set. An attacker who phishes your registrar credentials can initiate a transfer to a registrar they control before you notice. Once transferred, recovery often takes weeks of legal back-and-forth.`,
      recommendation: "Enable the client transfer prohibited (CLIENT-LOCK) flag at your registrar. Free, instant.",
      shortTermFix: "Log into your registrar → Domain settings → Lock Domain (or 'Transfer Lock' / 'Registrar Lock'). Toggle ON. Takes 30 seconds.",
      longTermFix: "Pair with 2FA on the registrar account itself + a unique password not used anywhere else. The registrar account is effectively a master key for your business identity.",
      affectedAsset: bare,
      evidence: `RDAP status flags: [${status.join(", ")}]`,
    });
  }

  // Privacy WHOIS / public contact exposure
  // RDAP exposes registrant contact via entities with role 'registrant'.
  // The previous JSON.stringify+regex was wrong: GDPR-redacted records often
  // have NO vCard fields at all (rather than literal "redacted"). Inspect the
  // vCard for actual contact data — fn (name), email, tel. If any are present
  // AND non-empty, privacy is OFF. Otherwise it's on (or unknown).
  const registrant = rdap.entities?.find((e) => e.roles?.includes("registrant"));
  function vcardHasContact(vcard: unknown): boolean {
    if (!Array.isArray(vcard)) return false;
    // vCard is ['vcard', [['fn', {}, 'text', 'John Doe'], ['email', {}, 'text', 'a@b.com']]]
    const items = vcard[1];
    if (!Array.isArray(items)) return false;
    for (const item of items as unknown[]) {
      if (!Array.isArray(item) || item.length < 4) continue;
      const [field, , , value] = item as [string, unknown, unknown, unknown];
      const interesting = ["fn", "email", "tel", "n", "adr"];
      if (interesting.includes(String(field).toLowerCase()) && typeof value === "string" && value.trim() && !/redacted|privacy|withheld|gdpr/i.test(value)) {
        return true;
      }
    }
    return false;
  }
  const privacyOff = registrant ? vcardHasContact(registrant.vcardArray) : false;
  if (privacyOff) {
    findings.push({
      category: "domain-hygiene",
      severity: "medium",
      title: "WHOIS privacy is OFF — owner contact info is publicly searchable",
      description: `${bare}'s registrant contact appears unredacted in public RDAP/WHOIS records. That means your name, email, and phone are scrapable by every spam database, phishing kit, and social-engineering operator on the internet. Privacy is free at most modern registrars and should be on by default.`,
      recommendation: "Enable WHOIS privacy / domain privacy at your registrar.",
      shortTermFix: "Log into your registrar → Domain settings → 'Domain Privacy' / 'WHOIS Privacy'. Toggle ON. Takes 30 seconds, free at most registrars.",
      longTermFix: "Use a dedicated email address (e.g., domain-admin@) for registrar contact instead of personal email. Reduces phishing surface against the owner.",
      affectedAsset: bare,
      evidence: "RDAP registrant entity present with no privacy/redacted markers",
    });
  }

  return findings;
}
