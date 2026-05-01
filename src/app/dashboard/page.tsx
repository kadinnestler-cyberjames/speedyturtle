import Link from "next/link";
import { listScans } from "@/lib/store";
import { Logo } from "@/components/Logo";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const scans = await listScans();
  const totalFindings = scans.reduce((s, x) => s + x.findings.length, 0);
  const sevCounts = scans.flatMap((s) => s.findings).reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<Severity, number>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2"><Logo size={28} /><span className="text-emerald-400">speedyturtle</span></Link>
          <Link href="/red-team" className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400">+ New scan</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-slate-400 mb-8">All scans across Red Team and Blue Team.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat label="Total scans" value={String(scans.length)} />
          <Stat label="Total findings" value={String(totalFindings)} />
          <Stat label="Critical + high" value={String((sevCounts.critical ?? 0) + (sevCounts.high ?? 0))} accent={(sevCounts.critical ?? 0) + (sevCounts.high ?? 0) > 0} />
          <Stat label="Avg findings / scan" value={scans.length === 0 ? "—" : (totalFindings / scans.length).toFixed(1)} />
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-4">Recent scans</h2>
          {scans.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No scans yet.</p>
              <Link href="/red-team" className="inline-block mt-3 text-emerald-400 hover:text-emerald-300 font-semibold">
                Run your first Red Team scan →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {scans.slice(0, 25).map((s) => (
                <li key={s.id}>
                  <Link href={`/scan/${s.id}`} className="flex items-center justify-between py-3 hover:bg-slate-800/30 rounded px-2 -mx-2 transition-colors">
                    <div>
                      <div className="font-mono text-slate-100">{s.input.target}</div>
                      <div className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400">{s.findings.length} findings</span>
                      <StatusBadge status={s.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent ? "text-rose-400" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: "queued" | "running" | "ready" | "failed" }) {
  const map = {
    queued: "bg-slate-700/50 text-slate-300",
    running: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    ready: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    failed: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[status]}`}>{status}</span>;
}
