import Link from "next/link";
import { BlueTeamScanForm } from "@/components/BlueTeamScanForm";

export default function BlueTeamScanFormPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">🐢 <span className="text-emerald-400">speedyturtle</span></Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
            <Link href="/blue-team" className="text-sky-400 font-semibold">Blue Team</Link>
            <Link href="/blue-team/compliance" className="text-slate-300 hover:text-white">Compliance</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold mb-2">🔵 Blue Team scan</div>
        <h1 className="text-4xl font-bold mb-3">Kick off a Blue Team scan.</h1>
        <p className="text-slate-300 mb-8">
          Same scanner stack as Red Team (subfinder + httpx + nuclei) but the output is rotated through the hardening
          loop: per-finding patches, chain break-points, compliance impact, and a verification re-scan when you&apos;re
          ready. If you already have a Red Team scan, paste its ID below to skip straight to hardening.
        </p>

        <BlueTeamScanForm />
      </div>
    </main>
  );
}
