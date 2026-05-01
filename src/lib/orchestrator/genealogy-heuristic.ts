import type { Finding } from "../types";

type FamilyTemplate = {
  familyName: string;
  match: (f: Finding) => boolean;
  lineage: { year: string; cveId: string; summary: string }[];
  evolution: string;
  nextMutation: string;
  defensiveInvariant: string;
};

const FAMILIES: FamilyTemplate[] = [
  {
    familyName: "Cross-site scripting (XSS) — output-context escaping failures",
    match: (f) => /(xss|cross[- ]site scripting|reflected|stored.*script|html injection)/i.test(f.title + f.description),
    lineage: [
      { year: "2005", cveId: "CVE-2005-3185", summary: "Early stored XSS in widely deployed forum software — first wave of automated XSS scanners" },
      { year: "2014", cveId: "CVE-2014-1492", summary: "Firefox CSP bypass via SVG — pattern shifted to CSP escape" },
      { year: "2019", cveId: "CVE-2019-5418", summary: "Rails ActionView render context confusion — server-side template returns user-controlled HTML" },
      { year: "2023", cveId: "CVE-2023-29489", summary: "cPanel reflected XSS via 404 handler — pattern persisted into 2020s admin panels" },
    ],
    evolution: "Each generation reflected the new defensive layer: sanitize-on-write (bypassed via context confusion), then output-encoding (bypassed via novel sinks like SVG/MathML), then CSP (bypassed via JSONP/trusted CDNs).",
    nextMutation: "DOM-based XSS in WASM-hosted UI components, or LLM-prompt-injection sinks in copilot-style chat panels embedded in admin UIs.",
    defensiveInvariant: "Never concatenate user input into output without context-aware encoding at the sink. Strict CSP with nonces beats every XSS variant when the nonce isn't reflectable.",
  },
  {
    familyName: "SQL injection — input parsing crosses the data/control boundary",
    match: (f) => /(sql injection|sqli|union select|sqlmap)/i.test(f.title + f.description),
    lineage: [
      { year: "1998", cveId: "CVE-1999-0073", summary: "Earliest catalogued SQLi in commercial web app — predates the OWASP era" },
      { year: "2008", cveId: "CVE-2008-2939", summary: "ModSecurity bypass — pattern persisted through WAF era via encoding tricks" },
      { year: "2017", cveId: "CVE-2017-1000208", summary: "Joomla SQLi via session fixation — bypassed parameterized-query advice" },
      { year: "2023", cveId: "CVE-2023-22515", summary: "Confluence broken access + SQLi chain — modern enterprise variant" },
    ],
    evolution: "Static analysis caught literal concatenation; ORMs caught raw queries; attackers moved to JSON path queries, NoSQL injection, and LIKE-clause leaks via second-order persistence.",
    nextMutation: "GraphQL nested-resolver injection via aliased fields, or vector-DB query-time prompt confusion in RAG systems.",
    defensiveInvariant: "Treat every value crossing into a query language as fundamentally untrusted, no matter how many layers it passed through. Parameterize at the driver, not the application.",
  },
  {
    familyName: "Path traversal / directory traversal — filesystem name resolution disagreement",
    match: (f) => /(path traversal|directory traversal|lfi|local file inclusion|\.\.\/|\.\.\\\\)/i.test(f.title + f.description),
    lineage: [
      { year: "2007", cveId: "CVE-2007-3010", summary: "IIS Unicode encoding traversal — early canonicalization gap" },
      { year: "2017", cveId: "CVE-2017-12615", summary: "Tomcat PUT method traversal — re-emerged after a decade of 'fixed' patterns" },
      { year: "2021", cveId: "CVE-2021-41773", summary: "Apache 2.4.49 path traversal + RCE chain — fix in 2.4.50 was incomplete (CVE-2021-42013)" },
      { year: "2024", cveId: "CVE-2024-23897", summary: "Jenkins CLI parser exposed file read via @ syntax — same canonicalization-disagreement pattern, new front-end" },
    ],
    evolution: "Defenders added prefix-strip checks, then path normalization, then chroot/jail. Attackers moved to encoding (UTF-8 overlong, double URL-encode), then to parser disagreement between front and back tiers.",
    nextMutation: "Container-mount escape via crafted volume paths in CI workers; or symlink-race traversal in ephemeral build environments.",
    defensiveInvariant: "Resolve to a canonical absolute path FIRST, then check it lives under an allowlisted root. Never check-then-resolve.",
  },
  {
    familyName: "Server-side request forgery (SSRF) — URL parser disagreement and trust transitivity",
    match: (f) => /(ssrf|server[- ]side request forgery|out[- ]of[- ]band|metadata.*169\.254|imdsv1)/i.test(f.title + f.description),
    lineage: [
      { year: "2017", cveId: "CVE-2017-7529", summary: "nginx range-header SSRF surface — early productized scanner finding" },
      { year: "2019", cveId: "CVE-2019-5736", summary: "runc + container metadata SSRF chain — popularized cloud-pivot impact" },
      { year: "2021", cveId: "CVE-2021-26855", summary: "Exchange ProxyLogon — SSRF as auth bypass front door, $200M+ impact" },
      { year: "2023", cveId: "CVE-2023-46805", summary: "Ivanti Connect Secure SSRF + cmd-injection chain — same pattern, edge appliance variant" },
    ],
    evolution: "Defenders blocked 169.254.169.254 → attackers used DNS rebinding. Blocked rebinding → used IPv6 mapped addresses. Blocked those → used parser-disagreement between scheme parser and resolver (e.g. //evil@target.com).",
    nextMutation: "SSRF into private LLM inference endpoints to exfiltrate prompts/embeddings, or into private MCP servers that expose internal tools.",
    defensiveInvariant: "Outbound HTTP from server-side code must go through an explicit allowlist proxy. The application code itself must not control the destination scheme/host.",
  },
  {
    familyName: "JWT / token signature bypass — algorithm confusion and weak secrets",
    match: (f) => /(jwt|json web token|alg.*none|weak.*secret|hs256|signature.*bypass)/i.test(f.title + f.description),
    lineage: [
      { year: "2015", cveId: "CVE-2015-9235", summary: "node jsonwebtoken alg=none acceptance — first widely-exploited JWT bypass" },
      { year: "2018", cveId: "CVE-2018-1000531", summary: "Inversoft JWT — RS256 to HS256 confusion attack" },
      { year: "2022", cveId: "CVE-2022-21449", summary: "Java ECDSA accepts (0,0) signature — entire JCA stack vulnerable" },
      { year: "2023", cveId: "CVE-2023-50967", summary: "JWT auth bypass in widely deployed Go library via missing alg pinning" },
    ],
    evolution: "Library defaults shifted away from accepting alg=none; attackers moved to algorithm confusion (RS→HS), then to mathematical signature bypasses (ECDSA(0,0), kid SQLi).",
    nextMutation: "Confused deputy attacks on cross-issuer JWT trust in federated identity (workload identity → IAM role chain).",
    defensiveInvariant: "Pin the expected algorithm at verification, validate kid against an allowlist, and reject tokens whose claims widen scope beyond what the issuer is authorized to assert.",
  },
  {
    familyName: "Insecure deserialization — language-level gadget chains",
    match: (f) => /(deserial|insecure deserialization|gadget chain|pickle|ysoserial|java serial)/i.test(f.title + f.description),
    lineage: [
      { year: "2017", cveId: "CVE-2017-9805", summary: "Apache Struts XStream deserialization → RCE — Equifax-class breach origin" },
      { year: "2019", cveId: "CVE-2019-2725", summary: "Oracle WebLogic XMLDecoder — repeated patch-bypass cycle" },
      { year: "2021", cveId: "CVE-2021-44521", summary: "Cassandra UDF + Java serialization gadget — pattern persists in JVM ecosystem" },
      { year: "2023", cveId: "CVE-2023-46604", summary: "ApacheMQ OpenWire serialization → RCE — actively exploited at scale" },
    ],
    evolution: "Allowlists of serializable types (jackson @class, java look-ahead) bypassed via nested polymorphic types; gadget hunters automated discovery of new chains as classpaths changed.",
    nextMutation: "Serialization-based RCE in ML model formats (pickle in HF transformers, Joblib in sklearn) via supply-chain malicious models.",
    defensiveInvariant: "Don't deserialize untrusted data into language-native object graphs. Use a schema-based format (protobuf, JSON-with-schema) and instantiate types explicitly.",
  },
  {
    familyName: "TLS protocol downgrade and cipher weakness",
    match: (f) => /(tls 1\.0|tls 1\.1|sslv|poodle|beast|crime|weak cipher|rc4|3des|null cipher|export cipher)/i.test(f.title + f.description),
    lineage: [
      { year: "2014", cveId: "CVE-2014-3566", summary: "POODLE — SSLv3 padding oracle, forced downgrade attack" },
      { year: "2014", cveId: "CVE-2014-0224", summary: "OpenSSL CCS injection — MITM via early-CCS protocol confusion" },
      { year: "2016", cveId: "CVE-2016-2107", summary: "OpenSSL padding-oracle in AES-NI — long-tail of crypto edge cases" },
      { year: "2020", cveId: "CVE-2020-1971", summary: "OpenSSL EDIPartyName NULL deref — parser bugs in cert chain validation" },
    ],
    evolution: "Each generation killed one downgrade vector; attackers shifted from protocol-version downgrade to cipher-suite downgrade to certificate-validation bypass to ALPN/SNI confusion.",
    nextMutation: "Post-quantum hybrid handshake misconfiguration (Kyber + classical) where one half can be silently dropped.",
    defensiveInvariant: "Negotiate only TLS 1.2+ with AEAD ciphers, enforce HSTS preload, and pin the certificate chain root for high-value clients.",
  },
  {
    familyName: "HTTP request smuggling / parser disagreement at trust boundary",
    match: (f) => /(request smuggling|http smuggling|crlf injection|host header injection|cl\.te|te\.cl)/i.test(f.title + f.description),
    lineage: [
      { year: "2005", cveId: "CVE-2005-2088", summary: "Apache mod_proxy original request smuggling — Watchfire whitepaper era" },
      { year: "2019", cveId: "CVE-2019-18277", summary: "haproxy CL.TE smuggling — Kettle's revival of the technique against modern stacks" },
      { year: "2022", cveId: "CVE-2022-1271", summary: "gzip+haproxy chunked smuggling — pattern adapted to modern compression handling" },
      { year: "2024", cveId: "CVE-2024-21733", summary: "Tomcat HTTP/2 smuggling — repeats once protocol version changes" },
    ],
    evolution: "Each fix tightened one parser pair; attackers found a new pair (front CDN vs origin, HTTP/1 vs HTTP/2, gzip vs deflate). The pattern is structural: any time two proxies disagree on framing, smuggling returns.",
    nextMutation: "Smuggling between QUIC proxy and HTTP/3 origin via differential handling of malformed STREAM frames; or between WAF-as-a-service and origin via inconsistent multipart parsing.",
    defensiveInvariant: "Use one HTTP parser end-to-end where possible. Where impossible, normalize on the front edge to a single canonical framing and reject ambiguity.",
  },
];

export function heuristicGenealogy(findings: Finding[]) {
  const families = FAMILIES.map((tpl) => {
    const matched = findings.filter((f) => tpl.match(f));
    if (matched.length === 0) return null;
    return {
      familyName: tpl.familyName,
      groupedFindings: matched.map((f) => f.id),
      lineage: tpl.lineage,
      evolution: tpl.evolution,
      nextMutation: tpl.nextMutation,
      defensiveInvariant: tpl.defensiveInvariant,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return { families };
}
