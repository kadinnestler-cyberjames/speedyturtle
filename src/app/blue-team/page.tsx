import Link from "next/link";
import { BlueTeamLookupForm } from "@/components/BlueTeamLookupForm";
import { Logo } from "@/components/Logo";

export default function BlueTeamPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2"><Logo size={28} /><span className="text-emerald-400">speedyturtle</span></Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
            <Link href="/blue-team" className="text-sky-400 font-semibold">Blue Team</Link>
            <Link href="/blue-team/compliance" className="text-slate-300 hover:text-white">Compliance</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Blue Team v1 — Hardening Loop + Continuous Monitoring + Compliance
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Patch faster than
          <br />
          <span className="text-sky-400">they can probe.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
          Red Team finds the holes. Blue Team closes them. Per-finding patches, exploit-chain break-points,
          continuous monitoring with email alerts, and one-click compliance PDFs across HIPAA, PCI, SHIELD, and NIST CSF 2.0.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <Link href="/blue-team/scan" className="px-6 py-3 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400">
            Start a Blue Team scan
          </Link>
          <Link href="/blue-team/compliance" className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-100">
            See compliance coverage →
          </Link>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-12">
        <BlueTeamLookupForm />
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-2">Three capabilities, one product</h2>
        <p className="text-slate-400 mb-10">Built directly on top of the Red Team scanner. No new dependencies, no new logins.</p>
        <div className="grid md:grid-cols-3 gap-4">
          <Card title="Hardening Loop" body="Per-finding patch suggestions (Sonnet 4.6), break-points per exploit chain (Opus 4.7), and a one-click verification re-scan to prove the fix held." />
          <Card title="Continuous Monitoring" body="Register a target. Daily nuclei scan via Vercel cron. Diff vs baseline. Email alert via Resend when a new critical or high lands." />
          <Card title="Compliance Tracker" body="Findings mapped to controls in HIPAA-SRA, PCI DSS SAQ-A, NY SHIELD, and NIST CSF 2.0. Coverage gauge. PDF export tailored per framework." />
        </div>
      </section>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
          <div>© {new Date().getFullYear()} speedyturtle Blue Team. Part of the Tilacum stack.</div>
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
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
      <h3 className="font-bold text-sky-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}
