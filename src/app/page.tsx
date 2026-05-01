import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { Logo } from "@/components/Logo";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight flex items-center gap-2">
          <Logo size={32} />
          <span className="text-emerald-400">speedyturtle</span>
        </Link>
        <nav className="flex gap-6 text-sm items-center">
          <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
          <Link href="/blue-team" className="text-slate-300 hover:text-white">Blue Team</Link>
          <Link href="/benchmark/cti-realm" className="text-amber-300 hover:text-amber-200">CTI-REALM</Link>
          <Link href="/demo" className="text-slate-300 hover:text-white">Sample report</Link>
          <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
        </nav>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Autonomous AI security · Mythos-inspired · for SMBs
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Slow and steady wins
          <br />
          <span className="text-emerald-400">the security race.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
          Mythos-inspired offensive scanning, built for businesses that don&apos;t have a $50K Snyk contract. Five world-first reasoning layers: validator subagent, exploit chain reasoning, cheapest cut, adversary persona simulation, vulnerability genealogy.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <Link href="/red-team" className="px-6 py-3 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400">
            Run a Red Team scan
          </Link>
          <Link href="/blue-team" className="px-6 py-3 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400">
            Open Blue Team →
          </Link>
          <Link href="/demo" className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-100">
            See a sample report →
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-400">Free tier: 1 scan/mo · $99/mo Starter · $499/mo Pro · $1,499 flat Unlimited</p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <ScanForm />
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-2">Five world-first reasoning layers</h2>
        <p className="text-slate-400 mb-10">No commodity scanner. No &quot;AI sprinkled on top.&quot; Real multi-step Claude reasoning that nobody else has productized.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Feat color="emerald" emoji="🛡" title="Validator Subagent" body="Adversarial false-positive filter. Per AISLE 2026, this scaffold pattern alone closes the largest gap between Mythos and other models." />
          <Feat color="rose" emoji="⚡" title="Exploit Chain Reasoning" body="Claude Opus 4.5 composes multi-step kill chains using Kettle, Orange Tsai, PPP, and APT29 patterns." />
          <Feat color="emerald" emoji="✂" title="Cheapest Cut" body="One mitigation that breaks the most chains. Inverts findings list into actionable narrative." />
          <Feat color="purple" emoji="🎭" title="Adversary Persona Simulation" body="APT29 / Lazarus / Sandworm / Scattered Spider / GenericRansomware exposure scoring with dwell time estimates." />
          <Feat color="amber" emoji="📜" title="Vulnerability Genealogy" body="Trace each finding back through history. Show how the bug pattern mutated. Predict the next mutation." />
          <Feat color="sky" emoji="🔵" title="Blue Team is live" body="Hardening loop, continuous monitoring, and compliance tracker. Built on the same scanner stack — just rotated for defense. Open it at /blue-team." />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-3">Honest positioning</h2>
        <p className="text-slate-400 mb-6">We&apos;re not Mythos. We orchestrate Claude into Mythos&apos;s use cases.</p>
        <div className="grid md:grid-cols-3 gap-4">
          <Diff title="Snyk / Wiz" body="$50K+ enterprise contracts, procurement cycles. We sell at $99/mo on a credit card." />
          <Diff title="HackerOne / Bugcrowd" body="Pay per finding, requires a public bug bounty program. We give you predictable monthly cost on your own infra." />
          <Diff title="Mythos (when GA)" body="Frontier-model raw capability we can't match — but our orchestrator architecture lets us swap to Mythos when GA pricing drops." />
        </div>
      </section>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
          <div>© {new Date().getFullYear()} speedyturtle. Part of the Tilacum stack.</div>
          <div className="flex gap-4">
            <a href="mailto:kadinnestler@uptalk.us" className="hover:text-slate-300">kadinnestler@uptalk.us</a>
            <a href="tel:+17813663500" className="hover:text-slate-300">(781) 366-3500</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feat({ color, emoji, title, body }: { color: string; emoji: string; title: string; body: string }) {
  const map: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
    purple: "border-purple-500/30 bg-purple-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    sky: "border-sky-500/30 bg-sky-500/5",
  };
  return (
    <div className={`rounded-xl border ${map[color]} p-5`}>
      <div className="text-2xl mb-2">{emoji}</div>
      <h3 className="font-bold text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}

function Diff({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h3 className="font-bold text-emerald-400 mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}
