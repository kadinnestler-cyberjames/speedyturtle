/**
 * Certificate Transparency log enrichment via crt.sh.
 *
 * For every public CA-issued cert that's ever been issued for *.{domain},
 * the SAN list is logged in CT logs and indexed by crt.sh. This often
 * surfaces subdomains that subfinder misses entirely — staging/dev/admin
 * hosts that were briefly exposed to a CA but never indexed by passive
 * DNS sources.
 *
 * Uses crt.sh's JSON endpoint. Free, no key, occasional 502s (we handle).
 */

export type CtFinding = {
  category: "subdomain-exposure";
  severity: "info" | "low" | "medium";
  title: string;
  description: string;
  recommendation: string;
  shortTermFix: string;
  longTermFix: string;
  affectedAsset: string;
  evidence?: string;
};

type CrtRow = { name_value: string; issuer_name: string };

const HIGH_RISK_PREFIXES = ["dev", "staging", "test", "qa", "uat", "demo", "preview", "beta", "internal", "admin", "api", "git", "vpn", "remote", "jenkins", "ci", "build", "deploy"];

export async function runCrtScan(domain: string, knownHosts: string[] = []): Promise<CtFinding[]> {
  const findings: CtFinding[] = [];
  const bare = domain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!bare || !bare.includes(".")) return findings;

  let rows: CrtRow[] = [];
  try {
    const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(bare)}&output=json`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", "User-Agent": "speedyturtle-scanner/1.0" },
    });
    if (!res.ok) return findings;
    rows = (await res.json()) as CrtRow[];
  } catch {
    return findings;
  }

  // crt.sh returns name_value with newline-separated alt-names. Flatten + dedupe.
  const all = new Set<string>();
  for (const r of rows) {
    for (const name of (r.name_value ?? "").split(/\s+/)) {
      const n = name.toLowerCase().replace(/^\*\./, "").trim();
      if (!n) continue;
      if (n === bare || n.endsWith(`.${bare}`)) all.add(n);
    }
  }

  const known = new Set(knownHosts.map((h) => h.toLowerCase()));
  const newSubdomains = [...all].filter((s) => !known.has(s) && s !== bare);

  if (newSubdomains.length === 0) return findings;

  // Single roll-up finding for the count + a subset of the asset list.
  // Don't dump 200 subdomain rows into the report — show a representative subset.
  const sample = newSubdomains.slice(0, 25);
  const moreCount = Math.max(0, newSubdomains.length - sample.length);
  findings.push({
    category: "subdomain-exposure",
    severity: "low",
    title: `${newSubdomains.length} historical subdomain${newSubdomains.length === 1 ? "" : "s"} discovered via Certificate Transparency`,
    description: `Certificate Transparency (CT) logs every public TLS cert ever issued. We found ${newSubdomains.length} subdomains for ${bare} in CT history that passive DNS scanners (subfinder) didn't surface — often these are old staging/dev/admin hosts that were briefly exposed to a CA but never indexed elsewhere.\n\nSample (first ${sample.length}): ${sample.join(", ")}${moreCount > 0 ? ` (+${moreCount} more)` : ""}.`,
    recommendation: "Audit each historical subdomain. If it still resolves and serves content, decide whether it should be public or whether the DNS record + cert should be revoked.",
    shortTermFix: `Run \`dig +short <subdomain>\` against each. Anything that still resolves but you don't recognize → check it from a browser. Anything that's a stale dev/staging server → delete the DNS record and revoke the cert at the issuing CA.`,
    longTermFix: `Subscribe to CT-log monitoring for ${bare} (free at crt.sh email alerts, or paid via CertSpotter/Cert Watch). You'll get notified within hours of any new cert issued for your domain — including unauthorized ones.`,
    affectedAsset: bare,
    evidence: `crt.sh returned ${rows.length} cert rows yielding ${all.size} unique names; ${newSubdomains.length} not in the existing scan's host set`,
  });

  // Targeted high-risk-prefix findings
  const risky = newSubdomains.filter((s) => {
    const first = s.replace(`.${bare}`, "").split(".")[0];
    return HIGH_RISK_PREFIXES.includes(first);
  });
  for (const r of risky.slice(0, 5)) {
    findings.push({
      category: "subdomain-exposure",
      severity: "medium",
      title: `Sensitive-named subdomain in CT history: ${r}`,
      description: `${r} appears in Certificate Transparency logs for ${bare}. The hostname pattern (${r.split(".")[0]}) suggests this was internal infrastructure — staging, dev, admin, or build pipeline. If it still resolves, attackers will probe it specifically.`,
      recommendation: "Verify whether this host still resolves and is intentional. Stale internal hosts are a primary subdomain-takeover vector.",
      shortTermFix: `Run \`dig +short ${r}\` and \`curl -I https://${r}\`. If it resolves to a dangling cloud service (Heroku, AWS S3, Azure, GitHub Pages) you don't actively claim, consider it a takeover risk and revoke the DNS record TODAY.`,
      longTermFix: `Establish a tagging convention (\`internal-only\`, \`public\`) for every DNS record so audits can flag drift. Pair with a CT-log monitor.`,
      affectedAsset: r,
      evidence: `Found in CT log via crt.sh`,
    });
  }

  return findings;
}
