import type { ComplianceCoverage, ComplianceControlStatus } from "@/lib/blue-team/types";

const STATUS_BG: Record<ComplianceControlStatus, string> = {
  satisfied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  gap: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const STATUS_BAR: Record<ComplianceControlStatus, string> = {
  satisfied: "bg-emerald-500",
  partial: "bg-amber-500",
  gap: "bg-rose-500",
};

export function ComplianceCoverageView({ coverage }: { coverage: ComplianceCoverage }) {
  const fw = coverage.framework;
  const total = fw.controls.length;

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-baseline gap-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Coverage</div>
            <div className="text-5xl font-bold text-sky-400">{coverage.percent}%</div>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex h-4 rounded-full overflow-hidden bg-slate-800 mb-3">
              <div className={STATUS_BAR.satisfied} style={{ width: `${(coverage.satisfied / total) * 100}%` }} />
              <div className={STATUS_BAR.partial} style={{ width: `${(coverage.partial / total) * 100}%` }} />
              <div className={STATUS_BAR.gap} style={{ width: `${(coverage.gap / total) * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Cell color="emerald" label="Satisfied" value={coverage.satisfied} />
              <Cell color="amber" label="Partial" value={coverage.partial} />
              <Cell color="rose" label="Gap" value={coverage.gap} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-4">Per-control coverage</h2>
        <div className="space-y-2">
          {fw.controls.map((c) => (
            <article
              key={c.id}
              className={`rounded-xl border p-4 ${STATUS_BG[c.status]}`}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                <div className="font-mono text-sm font-bold">{c.id}</div>
                <span className="text-xs uppercase font-bold">{c.status}</span>
              </div>
              <p className="text-sm text-slate-100 mb-2">{c.description}</p>
              <div className="text-xs text-slate-400 flex gap-3 flex-wrap">
                <span>Family: {c.family}</span>
                <span>Evidence: {c.evidenceSource}</span>
                {c.lastEvidenceAt ? (
                  <span>Last: {new Date(c.lastEvidenceAt).toLocaleDateString()}</span>
                ) : (
                  <span>No evidence yet</span>
                )}
              </div>
              {c.findingsImpacting && c.findingsImpacting.length > 0 ? (
                <div className="mt-2 text-xs text-rose-200">
                  {c.findingsImpacting.length} live finding(s) impact this control.
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cell({ color, label, value }: { color: string; label: string; value: number }) {
  const map: Record<string, string> = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  };
  return (
    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${map[color]}`}>{value}</div>
    </div>
  );
}
