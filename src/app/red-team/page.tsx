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

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-rose-400 font-semibold mb-2">🔴 Red Team</div>
        <h1 className="text-4xl font-bold mb-3">Find what attackers will find first.</h1>
        <p className="text-slate-300 mb-8">
          Submit a target you own. Our autonomous Red Team agent runs subdomain enumeration (subfinder), live HTTP
          probing (httpx), and vulnerability scanning (nuclei) with safe-mode rate limits. Claude then triages the
          findings and generates a plain-English report.
        </p>

        <ScanForm />

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-bold mb-3">What we run, in order</h2>
          <ol className="space-y-3 text-sm text-slate-300">
            <li><strong className="text-emerald-400">1.</strong> <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">subfinder</code> — passive subdomain enumeration from public DNS sources (no scanning of your infra)</li>
            <li><strong className="text-emerald-400">2.</strong> <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">httpx</code> — probe each subdomain for live HTTP services, capture status codes, titles, web servers, tech stack</li>
            <li><strong className="text-emerald-400">3.</strong> <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">nuclei</code> — vuln template scanning at medium/high/critical severity, rate-limited to 30 req/sec</li>
            <li><strong className="text-emerald-400">4.</strong> <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">claude triage</code> — Claude Sonnet 4.6 reads all findings, prioritizes by real-world impact, writes the next-steps list</li>
          </ol>
        </div>

        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <strong className="block mb-2">⚠ Authorization required</strong>
          Running these tools against infrastructure you don&apos;t own can violate the Computer Fraud and Abuse Act
          (US), Computer Misuse Act (UK), and equivalent laws elsewhere. Only scan domains you own or have explicit
          written permission from the owner to test.
        </div>
      </div>
    </main>
  );
}
