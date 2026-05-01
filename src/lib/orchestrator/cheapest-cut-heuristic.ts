import type { Finding, CheapestCut, ExploitChain } from "../types";

type Bucket = {
  key: string;
  mitigation: string;
  implementationCost: string;
  match: (f: Finding) => boolean;
  chainTemplate?: (matched: Finding[]) => ExploitChain | null;
};

const BUCKETS: Bucket[] = [
  {
    key: "cookie-flags",
    mitigation: "Set HttpOnly + Secure + SameSite=Lax on session cookies",
    implementationCost: "single config change in app framework or reverse proxy",
    match: (f) => /cookie/i.test(f.title + f.description) && /(httponly|secure flag|samesite)/i.test(f.title + f.description),
    chainTemplate: (matched) => ({
      id: "heuristic-chain-cookies",
      title: "Session theft → account takeover via JS-accessible cookies",
      severity: "high",
      attackChain: [
        { step: 1, primitive: "stored or reflected XSS", description: "Inject script into any page that reflects user input", usesFindings: [] },
        { step: 2, primitive: "cookie exfiltration", description: "Read document.cookie because HttpOnly is missing, exfil to attacker-controlled host", usesFindings: matched.slice(0, 3).map((f) => f.id) },
        { step: 3, primitive: "session replay", description: "Replay the captured session cookie from any IP, bypassing login", usesFindings: [] },
      ],
      whyScannersMiss: "Scanner sees a missing cookie flag and a separate XSS template match — does not compose them into a single takeover chain.",
      defensiveBreakpoint: "Setting HttpOnly alone breaks step 2 entirely; combined with Secure+SameSite it also blocks CSRF-driven variants.",
    }),
  },
  {
    key: "security-headers",
    mitigation: "Add baseline security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) at the edge",
    implementationCost: "5-line block in nginx/Cloudflare/Vercel header config",
    match: (f) =>
      /(content[- ]security[- ]policy|csp|hsts|strict[- ]transport|x[- ]frame|x[- ]content[- ]type|referrer[- ]policy|clickjack|missing.*header)/i.test(
        f.title + f.description,
      ),
    chainTemplate: (matched) => ({
      id: "heuristic-chain-headers",
      title: "Clickjacking + MIME-sniff + downgrade attacks compound into UI-redress takeover",
      severity: "medium",
      attackChain: [
        { step: 1, primitive: "iframe embed", description: "Frame the target in an attacker page because X-Frame-Options is absent", usesFindings: matched.slice(0, 2).map((f) => f.id) },
        { step: 2, primitive: "MIME sniff to script", description: "Upload a polyglot file that the browser interprets as JS because X-Content-Type-Options is absent", usesFindings: [] },
        { step: 3, primitive: "downgrade and steal", description: "Strip TLS via SSL-strip on the first nav because HSTS is missing", usesFindings: [] },
      ],
      whyScannersMiss: "Each missing header is reported as info/low individually; the chain effect is invisible to template-match.",
      defensiveBreakpoint: "A single edge-config block (5 headers) breaks all three steps and any chain that relies on them.",
    }),
  },
  {
    key: "cors",
    mitigation: "Tighten CORS allowlist to explicit origins (no wildcard, no credentialed wildcard)",
    implementationCost: "one-line change in API CORS middleware",
    match: (f) => /(cors|cross[- ]origin|access[- ]control[- ]allow)/i.test(f.title + f.description),
  },
  {
    key: "admin-exposure",
    mitigation: "Restrict /admin, /actuator, /console, /.git, /.env, /backup to VPN or IP allowlist at the edge",
    implementationCost: "one location block in nginx or one Cloudflare WAF rule",
    match: (f) =>
      /(\/admin|\/actuator|\/console|\/phpmyadmin|\/wp[- ]admin|\.git|\.env|\.svn|backup|debug|api[- ]docs|swagger)/i.test(
        f.title + f.description + f.affectedAsset,
      ),
    chainTemplate: (matched) => ({
      id: "heuristic-chain-admin",
      title: "Direct admin-surface access → credential brute-force → privilege escalation",
      severity: "high",
      attackChain: [
        { step: 1, primitive: "discovery", description: "Hit exposed admin/config endpoint directly", usesFindings: matched.slice(0, 3).map((f) => f.id) },
        { step: 2, primitive: "credential probe", description: "Default-cred or low-volume credential stuffing against the panel", usesFindings: [] },
        { step: 3, primitive: "lateral", description: "Once authenticated, pivot to backing infra (DB console, secrets manager, deploy hooks)", usesFindings: [] },
      ],
      whyScannersMiss: "Each path is logged as info; together they're a fully exposed admin surface that an attacker enumerates in minutes.",
      defensiveBreakpoint: "Edge IP allowlist breaks step 1, which gates everything downstream.",
    }),
  },
  {
    key: "tls",
    mitigation: "Disable TLS 1.0/1.1 + weak ciphers; enforce HSTS preload",
    implementationCost: "one-line cipher suite change in nginx/Cloudflare TLS settings",
    match: (f) =>
      /(tls 1\.0|tls 1\.1|sslv|weak cipher|rc4|3des|expired certificate|self[- ]signed|no.*hsts|missing.*tls)/i.test(
        f.title + f.description,
      ),
  },
  {
    key: "info-disclosure",
    mitigation: "Strip server/version banners + suppress stack traces in production",
    implementationCost: "two config flags (server_tokens off + APP_DEBUG=false)",
    match: (f) =>
      /(server[- ]header|version disclosure|stack trace|debug.*enabled|x[- ]powered[- ]by|fingerprint)/i.test(f.title + f.description) ||
      f.category === "info-disclosure",
  },
  {
    key: "patch-cve",
    mitigation: "Patch the outdated component flagged with the highest CVSS score below",
    implementationCost: "one dependency bump + redeploy",
    match: (f) => Boolean(f.cveId),
  },
];

export function heuristicCheapestCut(findings: Finding[]): {
  cheapestCut: CheapestCut | null;
  syntheticChains: ExploitChain[];
} {
  if (findings.length === 0) return { cheapestCut: null, syntheticChains: [] };

  const matches = BUCKETS.map((b) => ({
    bucket: b,
    findings: findings.filter((f) => b.match(f)),
  })).filter((m) => m.findings.length > 0);

  if (matches.length === 0) {
    return { cheapestCut: null, syntheticChains: [] };
  }

  matches.sort((a, b) => b.findings.length - a.findings.length);
  const top = matches[0];

  const explanation = `${top.findings.length} of ${findings.length} findings fall under "${top.bucket.key}". Applying this single mitigation neutralizes all of them and any exploit chain that depends on them.`;

  const syntheticChains: ExploitChain[] = matches
    .filter((m) => m.bucket.chainTemplate)
    .map((m) => m.bucket.chainTemplate!(m.findings))
    .filter((c): c is ExploitChain => c !== null);

  const cheapestCut: CheapestCut = {
    mitigation: top.bucket.mitigation,
    // If we surfaced any synthetic chain, the top mitigation breaks at least one;
    // beyond that, count every bucket with ≥2 findings as another distinct chain.
    chainsBroken: Math.max(syntheticChains.length > 0 ? 1 : 0, matches.filter((m) => m.findings.length >= 2).length),
    implementationCost: top.bucket.implementationCost,
    explanation,
  };

  return { cheapestCut, syntheticChains };
}
