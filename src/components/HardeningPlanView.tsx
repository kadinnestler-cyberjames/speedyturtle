"use client";

import { useState } from "react";
import Link from "next/link";
import type { Scan, Severity } from "@/lib/types";
import type {
  HardeningPlan,
  PatchSuggestion,
  ChainBreakpoint,
  PatchEffort,
} from "@/lib/blue-team/types";

const SEV_BG: Record<Severity, string> = {
  critical: "bg-rose-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-500 text-slate-950",
  low: "bg-emerald-500/30 text-emerald-200 border border-emerald-500/30",
  info: "bg-slate-700 text-slate-200",
};

const EFFORT_BG: Record<PatchEffort, string> = {
  low: "bg-emerald-500/20 text-emerald-300",
  medium: "bg-amber-500/20 text-amber-300",
  high: "bg-rose-500/20 text-rose-300",
};

export function HardeningPlanView({
  scan,
  initialPlan,
}: {
  scan: Scan;
  initialPlan: HardeningPlan | null;
}) {
  const [plan, setPlan] = useState<HardeningPlan | null>(initialPlan);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ id: string; status: string; message: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/blue-team/harden", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-force-regen": "1" },
        body: JSON.stringify({ scanId: scan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate plan");
      setPlan(data as HardeningPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function startVerify() {
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/blue-team/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalScanId: scan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to start verify scan");
      setVerify({ id: data.verifyScanId, status: "queued", message: "Verification scan running…" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setVerifying(false);
    }
  }

  if (scan.status !== "ready") {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h1 className="text-xl font-bold text-amber-200">Scan not ready</h1>
          <p className="text-amber-100 mt-2">
            This scan is currently <strong>{scan.status}</strong>. Hardening plans require a completed scan.
          </p>
          <Link href={`/scan/${scan.id}`} className="inline-block mt-3 text-amber-300 hover:text-amber-200 underline">
            Open scan progress →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold mb-1">🔵 Blue Team — Hardening Plan</div>
            <h1 className="text-2xl font-bold">{scan.input.target}</h1>
            <p className="text-sm text-slate-400 mt-1">
              Scan: {new Date(scan.createdAt).toLocaleString()} · {scan.findings.length} findings
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/scan/${scan.id}`}
              className="px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-500 text-sm"
            >
              View Red Team report
            </Link>
            <Link
              href={`/blue-team/compliance?scanId=${scan.id}`}
              className="px-3 py-2 rounded-lg bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 text-sm font-semibold border border-sky-500/30"
            >
              Compliance →
            </Link>
          </div>
        </div>
      </header>

      {!plan ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-8 text-center">
          <h2 className="text-xl font-bold text-sky-200 mb-2">No hardening plan yet</h2>
          <p className="text-slate-300 mb-5">
            Generating a plan asks Sonnet 4.6 for one patch per finding and Opus 4.7 for chain break-points.
            Without an API key it falls back to deterministic heuristics.
          </p>
          <button
            onClick={generate}
            disabled={generating}
            className="px-5 py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold hover:bg-sky-400 disabled:opacity-40"
          >
            {generating ? "Generating…" : "Generate hardening plan →"}
          </button>
          {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        </div>
      ) : (
        <>
          <section className="bg-sky-500/5 border border-sky-500/30 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-sky-200 mb-3">Plan summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Patches suggested" value={String(plan.summary.patchCount)} />
              <Stat label="Chain break-points" value={String(plan.summary.chainCount)} />
              <Stat label="Quick wins" value={String(plan.summary.quickWins)} accent />
              <Stat label="Est. effort" value={`${plan.summary.estimatedEffortHours.toFixed(1)} hrs`} />
            </div>
            <div className="mt-5 flex gap-2 flex-wrap">
              <button
                onClick={generate}
                disabled={generating}
                className="px-3 py-1.5 rounded-lg border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 text-sm disabled:opacity-40"
              >
                {generating ? "Regenerating…" : "Regenerate plan"}
              </button>
              <button
                onClick={startVerify}
                disabled={verifying || verify !== null}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 text-sm disabled:opacity-40"
              >
                {verifying ? "Starting…" : verify ? "Verifying…" : "Run verification scan →"}
              </button>
            </div>
            {verify ? (
              <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-200">
                <div className="font-semibold mb-1">{verify.message}</div>
                <Link href={`/scan/${verify.id}`} className="underline">
                  Track verify scan progress →
                </Link>
              </div>
            ) : null}
            {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Per-finding patches · {plan.patches.length}</h2>
            <p className="text-sm text-slate-400 mb-4">
              Ordered by severity. Quick wins (low effort + high/critical) are highlighted.
            </p>
            <div className="space-y-3">
              {plan.patches.map((p) => <PatchCard key={p.findingId} patch={p} />)}
            </div>
          </section>

          {plan.chainBreakpoints.length > 0 ? (
            <section className="bg-rose-500/5 border border-rose-500/30 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-rose-200 mb-2">Chain break-points · {plan.chainBreakpoints.length}</h2>
              <p className="text-sm text-slate-300 mb-4">
                One mitigation per exploit chain that cuts it at the narrowest waist.
              </p>
              <div className="space-y-3">
                {plan.chainBreakpoints.map((b) => <BreakpointCard key={b.chainId} bp={b} />)}
              </div>
            </section>
          ) : null}

          {plan.complianceImpact.length > 0 ? (
            <section className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-emerald-200 mb-2">Compliance impact</h2>
              <p className="text-sm text-slate-300 mb-4">
                Findings mapped to the controls they violate. Click through to the compliance tracker for the full picture.
              </p>
              <ul className="text-sm text-slate-200 space-y-1">
                {Array.from(new Set(plan.complianceImpact.map((c) => c.framework))).map((fw) => (
                  <li key={fw}>
                    <Link href={`/blue-team/compliance?scanId=${scan.id}&framework=${fw}`} className="text-sky-300 hover:text-sky-200 underline">
                      {fw}
                    </Link>
                    <span className="text-slate-400 ml-2">
                      {plan.complianceImpact.filter((c) => c.framework === fw).length} mapping(s)
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function PatchCard({ patch }: { patch: PatchSuggestion }) {
  const isQuickWin = patch.effort === "low" && (patch.severity === "high" || patch.severity === "critical");
  return (
    <article className={`rounded-xl border p-4 ${isQuickWin ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-950/50"}`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h3 className="font-semibold text-slate-100">
          <span className="text-slate-500 font-mono text-sm mr-2">#{patch.priority}</span>
          {patch.title}
        </h3>
        <div className="flex gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${SEV_BG[patch.severity]}`}>{patch.severity}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${EFFORT_BG[patch.effort]}`}>effort: {patch.effort}</span>
          {isQuickWin ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">quick win</span> : null}
        </div>
      </div>
      <div className="text-xs font-mono text-slate-500 mb-2 break-all">{patch.affectedAsset}</div>
      <p className="text-sm text-slate-200 leading-relaxed">{patch.patch}</p>
      <div className="text-xs text-slate-500 mt-2">source: {patch.source}</div>
    </article>
  );
}

function BreakpointCard({ bp }: { bp: ChainBreakpoint }) {
  return (
    <article className="rounded-xl border border-rose-500/20 bg-slate-900/60 p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h3 className="font-semibold text-rose-100">{bp.chainTitle}</h3>
        <div className="flex gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${EFFORT_BG[bp.effort]}`}>effort: {bp.effort}</span>
          {typeof bp.cutsChainAtStep === "number" ? (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">cuts at step {bp.cutsChainAtStep}</span>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-slate-100 leading-relaxed mb-2">{bp.breakpoint}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{bp.rationale}</p>
      <div className="text-xs text-slate-500 mt-2">source: {bp.source}</div>
    </article>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ? "text-emerald-300" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}
