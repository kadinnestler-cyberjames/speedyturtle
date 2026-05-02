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
        <div className="flex justify-center mb-5">
          <Logo size={96} />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Autonomous AI security · Mythos-inspired · for SMBs
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Slow and steady wins
          <br />
          <span className="text-emerald-400">the security race.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
          Autonomous offensive scanning + blue-team hardening, built for businesses that don&apos;t have a $50K Snyk contract. Predictable monthly cost. No procurement cycle. Deploy on your own infra.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
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

