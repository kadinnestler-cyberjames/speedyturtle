/**
 * Email authentication posture check via DNS-over-HTTPS.
 *
 * Probes SPF, DKIM (selector enumeration), DMARC, MTA-STS, TLS-RPT, DNSSEC.
 * Each gap becomes a finding. This is the single biggest SMB blind spot —
 * most small businesses have no SPF/DMARC and only discover the problem
 * after their domain gets used for phishing.
 *
 * Uses Cloudflare's free DoH endpoint (https://1.1.1.1/dns-query) since
 * Google's DoH (dns.google/resolve) sometimes rate-limits us.
 */

export type EmailAuthFinding = {
  category: "email-auth";
  severity: "info" | "low" | "medium" | "high";
  title: string;
  description: string;
  recommendation: string;
  shortTermFix: string;
  longTermFix: string;
  affectedAsset: string;
  evidence?: string;
};

const DOH = "https://cloudflare-dns.com/dns-query";

type DoHAnswer = { name: string; type: number; data: string };
type DoHResponse = { Status: number; Answer?: DoHAnswer[] };

const COMMON_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",
  "selector2",
  "k1",
  "k2",
  "mailo",
  "mxvault",
  "smtp",
  "dkim",
  "s1",
  "s2",
  "mail",
];

async function dnsQuery(name: string, type: string): Promise<DoHAnswer[]> {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      // Don't let a slow upstream stall the orchestrator
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as DoHResponse;
    return data.Answer ?? [];
  } catch {
    return [];
  }
}

function stripQuotes(s: string): string {
  return s.replace(/^"+|"+$/g, "").replace(/"\s+"/g, "");
}

export async function runEmailAuthScan(domain: string): Promise<EmailAuthFinding[]> {
  const findings: EmailAuthFinding[] = [];

  // Bare domain only — strip protocol, port, path
  const bare = domain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!bare || !bare.includes(".")) return findings;

  const [spf, dmarc, mtaSts, tlsRpt, dnsKey] = await Promise.all([
    dnsQuery(bare, "TXT"),
    dnsQuery(`_dmarc.${bare}`, "TXT"),
    dnsQuery(`_mta-sts.${bare}`, "TXT"),
    dnsQuery(`_smtp._tls.${bare}`, "TXT"),
    dnsQuery(bare, "DNSKEY"),
  ]);

  // ── SPF ─────────────────────────────────────────────────────────────────
  const spfRecords = spf
    .map((a) => stripQuotes(a.data))
    .filter((d) => d.toLowerCase().startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    findings.push({
      category: "email-auth",
      severity: "high",
      title: "No SPF record — anyone can spoof email from your domain",
      description: `${bare} publishes no SPF (Sender Policy Framework) record. SPF tells receiving mail servers which servers are allowed to send mail "From: yourname@${bare}". Without it, an attacker can send phishing emails that pass basic spam checks and look like they came from your business.`,
      recommendation: "Publish a TXT record at the bare domain like 'v=spf1 include:_spf.google.com ~all' (replace with your real mail provider's include).",
      shortTermFix: `Add a TXT record on ${bare} of "v=spf1 include:<your-mail-provider's-spf> ~all". Take 5 minutes at your DNS provider.`,
      longTermFix: `Move from ~all (softfail) to -all (hardfail) once you've verified the include list covers every legitimate sender (newsletter platforms, ticketing tools, support desks). Pair with DMARC quarantine/reject and DKIM signing for full inbound trust.`,
      affectedAsset: bare,
      evidence: "DoH TXT lookup returned no v=spf1 record",
    });
  } else if (spfRecords.length > 1) {
    findings.push({
      category: "email-auth",
      severity: "medium",
      title: `Multiple SPF records published (${spfRecords.length}) — RFC 7208 violation`,
      description: `${bare} publishes ${spfRecords.length} SPF records. RFC 7208 only permits one. Receiving servers will treat the SPF check as PermError, which most providers (Google, Microsoft) treat as a hard fail — meaning legitimate mail is being rejected somewhere right now.`,
      recommendation: "Merge all sender mechanisms into a single TXT record. Multiple SPF records is one of the top causes of intermittent email delivery problems.",
      shortTermFix: "Open your DNS provider, find every TXT record starting with v=spf1, and combine the include: / ip4: / ip6: mechanisms into a single record. Delete the others.",
      longTermFix: "Set up SPF flattening + auto-monitoring (e.g. EasyDMARC, Valimail) to prevent multiple-record drift as your stack changes.",
      affectedAsset: bare,
      evidence: spfRecords.join(" || "),
    });
  } else {
    const r = spfRecords[0];
    if (r.includes("+all") || r.endsWith(" all")) {
      findings.push({
        category: "email-auth",
        severity: "high",
        title: "SPF set to +all — every server in the world can send as your domain",
        description: `Your SPF record ends in '+all', which permits any host to claim authority over ${bare}. This is functionally identical to having no SPF at all and is almost always a misconfiguration.`,
        recommendation: "Replace '+all' with '~all' (softfail) or '-all' (hardfail). This single change blocks the most common SPF abuse pattern.",
        shortTermFix: "Edit the SPF TXT record. Change ' +all' to ' ~all' for a low-risk start, then to ' -all' once verified.",
        longTermFix: "Pair with DMARC p=reject so receivers actually act on the SPF result.",
        affectedAsset: bare,
        evidence: r,
      });
    }
  }

  // ── DMARC ───────────────────────────────────────────────────────────────
  const dmarcRecords = dmarc
    .map((a) => stripQuotes(a.data))
    .filter((d) => d.toLowerCase().startsWith("v=dmarc1"));

  if (dmarcRecords.length === 0) {
    findings.push({
      category: "email-auth",
      severity: "high",
      title: "No DMARC record — your domain has no enforcement on impersonation",
      description: `${bare} has no DMARC (Domain-based Message Authentication, Reporting & Conformance) policy at _dmarc.${bare}. DMARC tells receiving mail servers what to do when an email fails SPF/DKIM, and gives you reports of impersonation attempts. Without it, you're flying blind on phishing campaigns that use your name.`,
      recommendation: "Publish a TXT record at _dmarc to start in monitor-only mode: 'v=DMARC1; p=none; rua=mailto:dmarc@yourdomain'.",
      shortTermFix: `Add a TXT record at _dmarc.${bare} with "v=DMARC1; p=none; rua=mailto:dmarc-reports@${bare}". You'll start receiving daily reports of who is sending email "from" you.`,
      longTermFix: "After ~30 days of report data confirms only legitimate senders, ramp policy from p=none → p=quarantine → p=reject. Goal: p=reject with pct=100. This is the only policy that actually blocks impersonation at the recipient.",
      affectedAsset: `_dmarc.${bare}`,
      evidence: "DoH TXT lookup at _dmarc returned no v=DMARC1 record",
    });
  } else {
    const r = dmarcRecords[0];
    const policyMatch = r.match(/p=(\w+)/i);
    const policy = policyMatch ? policyMatch[1].toLowerCase() : "none";
    if (policy === "none") {
      findings.push({
        category: "email-auth",
        severity: "medium",
        title: "DMARC policy is p=none — monitor mode only, no enforcement",
        description: `Your DMARC policy is p=none. That tells receiving servers to log impersonation attempts but still deliver them. Phishers using your domain still land in customer inboxes.`,
        recommendation: "Move policy to p=quarantine (then p=reject after ~30 days of reports confirm clean baseline).",
        shortTermFix: "Edit your DMARC TXT record. Change 'p=none' to 'p=quarantine' with 'pct=25' to soft-launch.",
        longTermFix: "Ramp pct=25 → 50 → 100 over 60 days, then move policy to p=reject. The full policy is the difference between a phishing-resistant domain and an unprotected one.",
        affectedAsset: `_dmarc.${bare}`,
        evidence: r,
      });
    }
    if (!r.match(/rua=/i)) {
      findings.push({
        category: "email-auth",
        severity: "low",
        title: "DMARC published but no aggregate report (rua=) destination",
        description: "Your DMARC record has no rua= tag, so you're not receiving the daily aggregate reports that show you who is sending mail using your domain. You have a policy but no visibility.",
        recommendation: `Add rua=mailto:dmarc-reports@${bare} (or use a free DMARC analytics service).`,
        shortTermFix: `Add 'rua=mailto:dmarc-reports@${bare}' to the DMARC record. Reports start arriving within 24 hours.`,
        longTermFix: "Sign up for a free DMARC reporting service (Postmark DMARC Digest, EasyDMARC free tier) so the XML reports are parsed for you.",
        affectedAsset: `_dmarc.${bare}`,
        evidence: r,
      });
    }
  }

  // ── DKIM (selector enumeration) ────────────────────────────────────────
  const dkimResults = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (sel) => {
      const ans = await dnsQuery(`${sel}._domainkey.${bare}`, "TXT");
      return { sel, ok: ans.some((a) => stripQuotes(a.data).toLowerCase().includes("v=dkim1") || stripQuotes(a.data).toLowerCase().includes("k=rsa")) };
    }),
  );
  const foundSelectors = dkimResults.filter((r) => r.ok).map((r) => r.sel);
  if (foundSelectors.length === 0) {
    findings.push({
      category: "email-auth",
      severity: "low",
      title: "No DKIM signing detected at common selectors",
      description: `We probed ${COMMON_DKIM_SELECTORS.length} commonly-used DKIM selectors (default, google, selector1/2, k1/2, etc.) and found no published key for ${bare}. DKIM may exist at a custom selector specific to your mail provider that we didn't probe — confirm by sending a test email through https://www.mail-tester.com. If DKIM is genuinely off, mail you send can be modified in transit and fail authenticity checks at Gmail/M365.`,
      recommendation: "Enable DKIM signing in your mail provider's admin panel. Most managed providers (Google Workspace, Microsoft 365, SendGrid, Mailgun) ship a one-click toggle.",
      shortTermFix: "Open your mail provider's domain authentication settings, click 'Enable DKIM', and add the DNS record they show you.",
      longTermFix: "Rotate DKIM keys annually. Use a 2048-bit key (some providers default to 1024 — bump it).",
      affectedAsset: bare,
      evidence: `Selectors probed: ${COMMON_DKIM_SELECTORS.join(", ")}`,
    });
  }

  // ── MTA-STS ────────────────────────────────────────────────────────────
  const mtaStsRecords = mtaSts
    .map((a) => stripQuotes(a.data))
    .filter((d) => d.toLowerCase().startsWith("v=stsv1"));
  if (mtaStsRecords.length === 0) {
    findings.push({
      category: "email-auth",
      severity: "low",
      title: "No MTA-STS policy — inbound mail vulnerable to TLS downgrade",
      description: `${bare} has no MTA-STS (Mail Transfer Agent Strict Transport Security) record. Without it, an attacker on the network path between a sender and your mail server can downgrade the connection from TLS to plaintext and intercept inbound email.`,
      recommendation: "Publish a TXT record at _mta-sts pointing to a policy file (https://mta-sts.{domain}/.well-known/mta-sts.txt).",
      shortTermFix: `Most managed mail providers (Google Workspace, Microsoft 365) offer a 1-click MTA-STS setup. Enable it and they'll create the record.`,
      longTermFix: "Pair with TLS-RPT so you receive reports of any TLS negotiation failures. Rotate the policy ID annually.",
      affectedAsset: `_mta-sts.${bare}`,
      evidence: "DoH TXT lookup at _mta-sts returned no v=STSv1 record",
    });
  }

  // ── TLS-RPT ────────────────────────────────────────────────────────────
  const tlsRptRecords = tlsRpt
    .map((a) => stripQuotes(a.data))
    .filter((d) => d.toLowerCase().startsWith("v=tlsrptv1"));
  if (tlsRptRecords.length === 0 && mtaStsRecords.length > 0) {
    findings.push({
      category: "email-auth",
      severity: "info",
      title: "MTA-STS published but no TLS-RPT for failure reporting",
      description: "You publish an MTA-STS policy but no TLS-RPT (TLS reporting) destination. You won't know when senders fail to negotiate TLS to your mail servers — which is exactly when you'd want to know.",
      recommendation: `Add a TXT record at _smtp._tls.${bare} like 'v=TLSRPTv1; rua=mailto:tlsrpt-reports@${bare}'.`,
      shortTermFix: `Add the TLS-RPT TXT record. Daily reports start within 24 hours.`,
      longTermFix: "Use a TLS-RPT analytics service (URIports, Postmark) so the JSON reports are parsed for you.",
      affectedAsset: `_smtp._tls.${bare}`,
    });
  }

  // ── DNSSEC ─────────────────────────────────────────────────────────────
  if (dnsKey.length === 0) {
    findings.push({
      category: "email-auth",
      severity: "low",
      title: "DNSSEC not enabled — DNS hijacking is undetectable",
      description: `${bare} is not signed with DNSSEC. An attacker who compromises your registrar or any upstream DNS server can change where your domain points without anyone being able to verify the records are authentic. DNSSEC adds cryptographic signatures so receiving resolvers can detect tampering.`,
      recommendation: "Enable DNSSEC in your registrar/DNS provider's admin panel. Most modern providers (Cloudflare, Google Domains, Route 53) make it a 1-click setting.",
      shortTermFix: "Open your registrar's domain settings, find DNSSEC, click 'Enable'. They'll publish the DS record at the registry automatically.",
      longTermFix: "Pair with CAA records that name the specific certificate authorities allowed to issue certs for your domain. Stops cert-misissuance attacks.",
      affectedAsset: bare,
      evidence: "DoH DNSKEY lookup returned no signed-zone keys",
    });
  }

  return findings;
}
