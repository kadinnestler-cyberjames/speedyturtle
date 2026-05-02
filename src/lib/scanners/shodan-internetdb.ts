/**
 * Shodan InternetDB free API — IP/port/CVE map for the target's host(s).
 *
 * https://internetdb.shodan.io/{ip} — no key, no rate limit (within reason).
 * Returns: ports, hostnames, CPEs, vulns (CVE list), tags.
 *
 * One finding per exposed port + a single rolled-up "exposed services" finding.
 * For CVEs returned, one finding per CVE.
 */

export type ShodanFinding = {
  category: "network-exposure" | "vulnerability";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommendation: string;
  shortTermFix: string;
  longTermFix: string;
  affectedAsset: string;
  evidence?: string;
  cveId?: string;
  cvssScore?: number;
};

type ShodanResponse = {
  ip: string;
  ports?: number[];
  hostnames?: string[];
  cpes?: string[];
  vulns?: string[];
  tags?: string[];
};

const SUSPICIOUS_PORTS: Record<number, { name: string; sev: ShodanFinding["severity"]; why: string }> = {
  21: { name: "FTP", sev: "high", why: "FTP transmits credentials in cleartext and is almost never the right answer for public-facing access in 2025." },
  23: { name: "Telnet", sev: "high", why: "Telnet transmits credentials in cleartext. There is no legitimate reason to have it open in 2025." },
  25: { name: "SMTP", sev: "low", why: "SMTP open is normal for mail servers; check that it's intentional and that auth is required for relay." },
  110: { name: "POP3", sev: "medium", why: "POP3 (unencrypted) — modern mail clients should use POP3S/IMAPS instead." },
  135: { name: "MS-RPC", sev: "high", why: "Windows RPC exposed to the public internet. Frequent target of credential-relay and lateral-movement attacks." },
  139: { name: "NetBIOS", sev: "high", why: "NetBIOS exposes Windows file/print sharing details. Should never be public." },
  445: { name: "SMB", sev: "critical", why: "SMB exposed to the public internet was the entry point for WannaCry, NotPetya, and dozens of ransomware campaigns. Block immediately." },
  1433: { name: "MSSQL", sev: "high", why: "Microsoft SQL Server exposed publicly is a primary brute-force target." },
  3306: { name: "MySQL", sev: "high", why: "MySQL exposed publicly is a primary brute-force / credential-stuffing target." },
  3389: { name: "RDP", sev: "critical", why: "RDP is the #1 ransomware entry vector per Microsoft Digital Defense Report. If exposed, restrict to VPN/IP allowlist immediately." },
  5900: { name: "VNC", sev: "high", why: "VNC has weak default auth and is regularly fingerprinted by mass-scanning ransomware operators." },
  6379: { name: "Redis", sev: "critical", why: "Redis with no auth exposed publicly = trivial RCE in many configurations. Patch and bind to localhost." },
  9200: { name: "Elasticsearch", sev: "high", why: "Elasticsearch open to the internet typically leaks entire databases via /_search. Bind to localhost or VPN." },
  11211: { name: "Memcached", sev: "high", why: "Memcached exposed = data leakage and DDoS-amplification risk. Bind to localhost." },
  27017: { name: "MongoDB", sev: "critical", why: "MongoDB without auth exposed = automated ransom of entire DB. Hundreds of thousands of cases. Bind to localhost or auth+TLS." },
  2049: { name: "NFS", sev: "high", why: "NFS open to the internet leaks filesystem contents." },
  5432: { name: "PostgreSQL", sev: "high", why: "Postgres exposed publicly is a primary brute-force target." },
  9000: { name: "PHP-FPM/Portainer", sev: "medium", why: "Common admin panel port — verify which service is listening and whether it requires auth." },
  8080: { name: "HTTP-Alt", sev: "low", why: "Often a forgotten dev/staging server or admin UI. Verify it's intentional." },
  8443: { name: "HTTPS-Alt", sev: "low", why: "Often a forgotten admin UI (cPanel/Plesk run on 2083/8443). Verify intent." },
  2083: { name: "cPanel/SSL", sev: "medium", why: "cPanel admin login. Should be IP-restricted or behind a VPN." },
  10000: { name: "Webmin", sev: "medium", why: "Webmin admin panel. Frequent target of CVE-based exploit chains; restrict to VPN." },
};

async function resolveIp(host: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    const a = (data.Answer ?? []).find((r) => r.type === 1);
    return a?.data ?? null;
  } catch {
    return null;
  }
}

async function queryInternetDb(ip: string): Promise<ShodanResponse | null> {
  try {
    const res = await fetch(`https://internetdb.shodan.io/${ip}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ShodanResponse;
  } catch {
    return null;
  }
}

export async function runShodanScan(host: string): Promise<ShodanFinding[]> {
  const findings: ShodanFinding[] = [];
  const bare = host.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!bare) return findings;

  const ip = await resolveIp(bare);
  if (!ip) return findings;

  const data = await queryInternetDb(ip);
  if (!data) return findings;

  // Per-port findings for suspicious services
  const ports = data.ports ?? [];
  const suspiciousFound = ports
    .map((p) => ({ port: p, info: SUSPICIOUS_PORTS[p] }))
    .filter((x): x is { port: number; info: typeof SUSPICIOUS_PORTS[number] } => Boolean(x.info));

  for (const { port, info } of suspiciousFound) {
    findings.push({
      category: "network-exposure",
      severity: info.sev,
      title: `${info.name} (port ${port}) exposed on ${ip}`,
      description: `${info.why}\n\nShodan's InternetDB sees port ${port} open on ${ip} (the IP ${bare} resolves to). Public exposure of ${info.name} is one of the top entry vectors for opportunistic ransomware.`,
      recommendation: `Restrict port ${port} to a VPN or IP allowlist — or close it entirely if not in use.`,
      shortTermFix: `In your firewall (host-level iptables/ufw, AWS security group, or hosting-provider control panel), close port ${port} to 0.0.0.0/0. Allow only from your office IPs or VPN.`,
      longTermFix: `Audit every public port quarterly. Maintain an explicit "expected open ports" inventory and alert on drift. For databases (3306, 5432, 27017, 6379), bind the service to localhost or a private VLAN — never to a public interface.`,
      affectedAsset: `${ip}:${port} (${bare})`,
      evidence: `Shodan InternetDB: ports=[${ports.join(", ")}]`,
    });
  }

  // Roll-up: total ports beyond 80/443
  const benignPorts = new Set([80, 443]);
  const extraPorts = ports.filter((p) => !benignPorts.has(p) && !SUSPICIOUS_PORTS[p]);
  if (extraPorts.length > 0) {
    findings.push({
      category: "network-exposure",
      severity: extraPorts.length >= 4 ? "low" : "info",
      title: `${extraPorts.length} non-standard port${extraPorts.length === 1 ? "" : "s"} also open on ${ip}`,
      description: `Beyond the suspicious services flagged above, ${extraPorts.length} additional port${extraPorts.length === 1 ? "" : "s"} ${extraPorts.length === 1 ? "is" : "are"} open: ${extraPorts.slice(0, 10).join(", ")}${extraPorts.length > 10 ? "…" : ""}. Each open port is attack surface; verify each one is intentional.`,
      recommendation: "Audit each open port. Close any that aren't actively serving a verified business function.",
      shortTermFix: "Run `nmap -Pn <ip>` from outside your network and verify each banner. Anything you can't identify should be closed.",
      longTermFix: "Document the expected port list as code (e.g. Terraform security group rules) and monitor for drift via Shodan or Censys email alerts.",
      affectedAsset: `${ip} (${bare})`,
      evidence: `Open ports: [${ports.join(", ")}]`,
    });
  }

  // CVEs from Shodan (CPEs the host announces)
  const vulns = (data.vulns ?? []).slice(0, 25); // cap to keep report sane
  for (const cve of vulns) {
    findings.push({
      category: "vulnerability",
      severity: "high",
      title: `${cve} reported on host services (Shodan InternetDB)`,
      description: `Shodan's InternetDB associates ${cve} with one or more services running on ${ip}. CVEs surface here when the service banner matches a vulnerable version. The actual exploitability depends on patches your provider may have backported — but the version-banner advertises it.`,
      recommendation: `Check the CVE details, identify which service is affected, and patch.`,
      shortTermFix: `Look up ${cve} at https://nvd.nist.gov/vuln/detail/${cve}. Identify the affected component (banner-matched). Apply the vendor patch or upgrade.`,
      longTermFix: `Subscribe to vendor security advisories for every component you run. Set up a 30-day rescan in speedyturtle to confirm the CVE drops off the InternetDB record after patching.`,
      affectedAsset: `${ip} (${bare})`,
      cveId: cve,
      evidence: `Shodan InternetDB CPE/vuln cross-reference`,
    });
  }

  return findings;
}
