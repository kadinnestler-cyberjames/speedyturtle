import Link from "next/link";
import { ScanResult } from "@/components/ScanResult";
import { buildDemoScan } from "@/lib/demo-scan";

export default function DemoPage() {
  const scan = buildDemoScan();
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">
            🐢 <span className="text-emerald-400">speedyturtle</span>
          </Link>
          <Link href="/red-team" className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400">
            Run a real scan →
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="font-bold text-amber-200">Sample report</h2>
              <p className="text-sm text-amber-100 mt-1">
                This is a pre-baked demonstration of every speedyturtle feature using a fictional target. No actual scanning happened. To run a real scan against a target you own, head to <Link href="/red-team" className="underline font-semibold">Red Team</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-12">
        <ScanResult scanId={scan.id} initialScan={scan} />
      </div>
    </main>
  );
}
