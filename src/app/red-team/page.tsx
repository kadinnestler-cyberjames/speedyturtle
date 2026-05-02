import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { Logo } from "@/components/Logo";

export default function RedTeamPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2"><Logo size={28} /><span className="text-emerald-400">speedyturtle</span></Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-rose-400 font-semibold">Red Team</Link>
            <Link href="/blue-team" className="text-slate-300 hover:text-white">Blue Team</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Red Team v1 — Recon + Vuln Scanning + Five Reasoning Layers
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Find what attackers
          <br />
          <span className="text-rose-400">will find first.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
          Submit a target you own. Our autonomous Red Team agent runs subdomain enumeration, live HTTP probing,
          vulnerability scanning, and 5 Claude-driven reasoning layers — validator subagent, exploit-chain reasoning,
          cheapest-cut analysis, adversary persona simulation, and vulnerability genealogy.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <Link href="#scan" className="px-6 py-3 rounded-lg bg-rose-500 text-white font-semibold hover:bg-rose-400">
            Start a Red Team scan
          </Link>
          <Link href="/demo" className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-100">
            See a sample report →
          </Link>
        </div>
      </section>

      <section id="scan" className="max-w-3xl mx-auto px-6 pb-8">
        <ScanForm />
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-12">
        <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer text-sm text-slate-300 hover:text-white">
            Already have a scan ID? Open it →
          </summary>
          <div className="mt-4 text-sm text-slate-400">
            Paste any speedyturtle scan ID (UUID) into the URL like <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">/scan/&lt;id&gt;</code>, or visit the
            <Link href="/dashboard" className="text-rose-300 hover:text-rose-200 underline ml-1">Dashboard</Link> to browse all your runs.
          </div>
        </details>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-2">What we run, in order</h2>
        <p className="text-slate-400 mb-10">Real scanners — not "AI sprinkled on top." Same toolchain a 30-yr red team pro would reach for, plus Claude on top of every output.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card title="1. Passive recon" body="subfinder + crt.sh certificate transparency historical subdomain enumeration. No scanning of your infra during this stage — we read public sources." />
          <Card title="2. Live probing" body="httpx fingerprints every live HTTP service: status, title, web server, tech stack. CDN/WAF detection sets the baseline for what defenses are observed holding." />
          <Card title="3. Vulnerability scanning" body="nuclei runs 5,000+ templates at low/medium/high/critical severity, rate-limited to 150 req/s, against confirmed live URLs only." />
          <Card title="4. Domain posture" body="DNS-over-HTTPS probes for SPF, DMARC, DKIM (13 selectors), MTA-STS, TLS-RPT, DNSSEC. Shodan InternetDB for exposed ports. RDAP for registrar-lock + WHOIS-privacy hygiene." />
          <Card title="5. Breach exposure" body="Have I Been Pwned check for any breach affecting your domain. Severity grades by leaked data class — passwords/CC = high, names/addresses = medium." />
          <Card title="6. Claude reasoning" body="Five layers: validator subagent (false-positive filter), exploit chain reasoning (Opus 4.7 with Mermaid storyboards), cheapest cut, adversary persona simulation, vulnerability genealogy." />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-2">What you get back</h2>
        <p className="text-slate-400 mb-10">A single PDF + live result page that reads like a 30-yr red team pro wrote it — not a scanner dump.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card title="Cyber Health Rating" body="0-100 score with insurance underwriting bands (Preferred / Standard / Subprime / Declined). Speaks the language an SMB owner already uses with their broker." />
          <Card title="NIST 5×5 risk matrix" body="Every non-info finding plotted on a likelihood × impact grid. Empty top-right is the punchline — defenses holding." />
          <Card title="Defensive posture radar" body="6-axis spider chart: Patch Hygiene, TLS, Auth Hardening, Edge Protection, Public Exposure, Third-Party Risk." />
          <Card title="Industry baseline bars" body="IBM 2025 + Verizon DBIR comparisons. Your residual exposure vs $4.44M global / $10.22M U.S. avg breach cost." />
          <Card title="Drift detection" body="Since-last-scan delta — NEW / FIXED / PERSISTING. Turns one-shot reports into a subscription product with built-in recurring value." />
          <Card title="Mermaid attack tree" body="One-glance picture: worst-case business outcome at the root, every chain's entry vector as a branch, [BLOCKED] tags on leaves your defenses prevent." />
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <strong className="block mb-2">⚠ Authorization required</strong>
          Running these tools against infrastructure you don&apos;t own can violate the Computer Fraud and Abuse Act
          (US), Computer Misuse Act (UK), and equivalent laws elsewhere. Only scan domains you own or have explicit
          written permission from the owner to test.
        </div>
      </section>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
          <div>© {new Date().getFullYear()} speedyturtle Red Team. Part of the Tilacum stack.</div>
          <div className="flex gap-4">
            <a href="mailto:kadinnestler@uptalk.us" className="hover:text-slate-300">kadinnestler@uptalk.us</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
      <h3 className="font-bold text-rose-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}
