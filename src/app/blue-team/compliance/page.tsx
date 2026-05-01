import Link from "next/link";
import {
  COMPLIANCE_FRAMEWORKS,
  computeCoverage,
  selectFramework,
  summarizeFrameworks,
} from "@/lib/blue-team/compliance";
import { loadScan } from "@/lib/store";
import { ComplianceCoverageView } from "@/components/ComplianceCoverageView";
import type { Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ scanId?: string; framework?: string }>;
}) {
  const sp = await searchParams;
  const scanId = sp.scanId ?? null;
  const frameworkSlug = sp.framework ?? "ny-shield";

  let findings: Finding[] = [];
  let target: string | null = null;
  if (scanId) {
    const scan = await loadScan(scanId);
    if (scan) {
      findings = scan.findings;
      target = scan.input.target;
    }
  }

  const framework = selectFramework(frameworkSlug) ?? COMPLIANCE_FRAMEWORKS[0];
  const coverage = computeCoverage(framework, findings);
  const summaries = summarizeFrameworks();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">🐢 <span className="text-emerald-400">speedyturtle</span></Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
            <Link href="/blue-team" className="text-slate-300 hover:text-white">Blue Team</Link>
            <Link href="/blue-team/compliance" className="text-sky-400 font-semibold">Compliance</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold mb-1">Compliance Tracker</div>
            <h1 className="text-3xl font-bold">{framework.name}</h1>
            <p className="text-sm text-slate-400 mt-1">{framework.appliesTo}</p>
          </div>
          <a
            href={`/api/blue-team/compliance/pdf?framework=${framework.slug}${scanId ? `&scanId=${scanId}` : ""}`}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-bold hover:bg-sky-400"
          >
            Download PDF →
          </a>
        </div>

        <div className="grid md:grid-cols-4 gap-2 mb-8">
          {summaries.map((s) => {
            const isActive = s.slug === framework.slug;
            const href = `/blue-team/compliance?framework=${s.slug}${scanId ? `&scanId=${scanId}` : ""}`;
            return (
              <Link
                key={s.slug}
                href={href}
                className={`rounded-xl border p-4 transition ${
                  isActive
                    ? "border-sky-500/50 bg-sky-500/10"
                    : "border-slate-800 bg-slate-900 hover:border-slate-600"
                }`}
              >
                <div className="text-xs uppercase tracking-wider text-slate-500">{s.slug}</div>
                <div className={`font-bold mt-1 ${isActive ? "text-sky-300" : "text-slate-100"}`}>{s.name}</div>
                <div className="text-xs text-slate-400 mt-1">{s.totalControls} controls</div>
              </Link>
            );
          })}
        </div>

        {scanId && target ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-6 text-sm text-slate-300">
            Overlaying findings from{" "}
            <Link href={`/scan/${scanId}`} className="text-sky-300 underline">
              {target}
            </Link>{" "}
            scan.{" "}
            <Link href={`/blue-team/compliance?framework=${framework.slug}`} className="text-slate-500 underline">
              Clear
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-6 text-sm text-slate-400">
            Showing baseline coverage. Pass{" "}
            <code className="font-mono text-xs bg-slate-950 px-1 py-0.5 rounded">?scanId=&lt;uuid&gt;</code> to overlay live findings.
          </div>
        )}

        <ComplianceCoverageView coverage={coverage} />
      </div>
    </main>
  );
}
