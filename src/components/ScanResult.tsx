"use client";

import { useEffect, useMemo, useState } from "react";
import type { Scan, Severity } from "@/lib/types";
import { MermaidDiagram } from "./MermaidDiagram";
import { ClientTimestamp } from "./ClientTimestamp";

const SEV_COLOR: Record<Severity, string> = {
  critical: "bg-rose-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-500 text-slate-950",
  low: "bg-emerald-500/30 text-emerald-200 border border-emerald-500/30",
  info: "bg-slate-700 text-slate-200",
};

type Verdict = NonNullable<Scan["validation"]>["verdicts"][number];

const VERDICT_PILL: Record<Verdict["verdict"], string> = {
  validated: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30",
  "false-positive": "bg-slate-700/50 text-slate-300 border border-slate-700",
  "needs-review": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
};

const VERDICT_LABEL: Record<Verdict["verdict"], string> = {
  validated: "✅ validated",
  "false-positive": "❌ false positive",
  "needs-review": "⚠ needs review",
};

function findVerdict(map: Map<string, Verdict>, findingId: string): Verdict | undefined {
  return map.get(findingId.slice(0, 8)) ?? map.get(findingId);
}

export function ScanResult({ scanId, initialScan }: { scanId: string; initialScan: Scan }) {
  const [scan, setScan] = useState<Scan>(initialScan);
  const [hideFalsePositives, setHideFalsePositives] = useState(true);

  useEffect(() => {
    if (scan.status === "ready" || scan.status === "failed") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/scan/${scanId}/status`, { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data.status === "ready") {
          window.location.reload();
          return;
        }
        setScan((prev) => ({ ...prev, status: data.status, progress: data.progress }));
        if (data.status !== "ready") {
          timer = setTimeout(tick, 4_000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 6_000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanId, scan.status]);

  const isRunning = scan.status === "queued" || scan.status === "running";

  const verdictByFindingId = useMemo(() => {
    const map = new Map<string, Verdict>();
    for (const v of scan.validation?.verdicts ?? []) {
      map.set(v.findingId, v);
    }
    return map;
  }, [scan.validation]);

  const visibleFindings = useMemo(() => {
    if (!hideFalsePositives || !scan.validation) return scan.findings;
    return scan.findings.filter((f) => findVerdict(verdictByFindingId, f.id)?.verdict !== "false-positive");
  }, [scan.findings, scan.validation, hideFalsePositives, verdictByFindingId]);

  const grouped = groupBySeverity(visibleFindings);
  const fpCount = scan.validation?.summary.falsePositive ?? 0;
  const showFpToggle = fpCount > 0;

  return (
    <div className="space-y-6">
      <header className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-rose-400 font-semibold mb-1">
              🔴 Red Team scan
            </div>
            <h1 className="text-2xl font-bold">{scan.input.target}</h1>
            <p className="text-sm text-slate-400 mt-1">
              <ClientTimestamp iso={scan.createdAt} /> · {scan.findings.length} findings
            </p>
          </div>
          {scan.status === "ready" && (
            <a
              href={`/api/pdf/${scan.id}`}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
            >
              Download PDF →
            </a>
          )}
        </div>
      </header>

      {isRunning && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-300 font-semibold">{scan.progress.message}</span>
            <span className="text-sm font-mono text-emerald-400">{scan.progress.pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${scan.progress.pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Page auto-refreshes when complete. Typical scan: 2-5 minutes.
          </p>
        </div>
      )}

      {scan.status === "failed" && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6">
          <h3 className="font-bold text-rose-300">Scan failed</h3>
          <p className="text-sm text-rose-200 mt-1">{scan.error || "Unknown error"}</p>
        </div>
      )}

      {scan.triage && (
        <section className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-emerald-300 mb-3">Triage summary (Claude)</h2>
          <p className="text-slate-100 leading-relaxed mb-5">{scan.triage.summary}</p>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-2">Top risks</h3>
              <ul className="space-y-2 text-sm text-slate-200">
                {scan.triage.topRisks.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-2">Next steps</h3>
              <ul className="space-y-2 text-sm text-slate-200">
                {scan.triage.nextSteps.map((s, i) => (
                  <li key={i}>{i + 1}. {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {scan.exploitChains && scan.exploitChains.length > 0 && (
        <section className="bg-rose-500/5 border border-rose-500/30 rounded-2xl p-6">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-400 font-semibold">⚡ Exploit Chain Reasoning</div>
              <h2 className="text-lg font-bold text-rose-200 mt-1">{scan.exploitChains.length} composable attack {scan.exploitChains.length === 1 ? "chain" : "chains"} identified</h2>
            </div>
            <span className="text-xs text-rose-300/70">Claude Opus · Mythos-inspired multi-step reasoning</span>
          </div>
          <p className="text-sm text-slate-300 mb-5">
            These chains compose primitives that look low-severity in isolation. Scanners miss them because they require thinking 3-5 moves ahead.
          </p>
          <div className="space-y-4">
            {scan.exploitChains.map((c) => (
              <article key={c.id} className="rounded-xl border border-rose-500/20 bg-slate-900/60 p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                  <h3 className="text-base font-bold text-rose-200">{c.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${SEV_COLOR[c.severity]}`}>
                    {c.severity}
                  </span>
                </div>
                <ol className="space-y-1.5 mb-3 text-sm text-slate-200">
                  {c.attackChain.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-rose-400 font-mono shrink-0">{s.step}.</span>
                      <span><strong className="text-slate-100">{s.primitive}:</strong> {s.description}</span>
                    </li>
                  ))}
                </ol>
                {c.mermaid && c.mermaid.trim() && (
                  <MermaidDiagram code={c.mermaid} className="my-3" />
                )}
                <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
                  <p className="mb-1"><strong className="text-slate-300">Why scanners miss it:</strong> {c.whyScannersMiss}</p>
                  <p><strong className="text-emerald-400">Defensive break-point:</strong> {c.defensiveBreakpoint}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {scan.adversaryProfile && scan.adversaryProfile.length > 0 && (
        <section className="bg-purple-500/5 border border-purple-500/30 rounded-2xl p-6">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-purple-400 font-semibold">🎭 Adversary Persona Simulation</div>
              <h2 className="text-lg font-bold text-purple-200 mt-1">If a known threat actor were targeting you…</h2>
            </div>
            <span className="text-xs text-purple-300/70">MITRE ATT&CK + named APT TTPs</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {scan.adversaryProfile.map((a) => (
              <div key={a.persona} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h4 className="font-bold text-slate-100">{a.persona}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    a.exposureScore >= 60 ? "bg-rose-500/20 text-rose-300" :
                    a.exposureScore >= 30 ? "bg-amber-500/20 text-amber-300" :
                    "bg-emerald-500/20 text-emerald-300"
                  }`}>
                    Exposure: {a.exposureScore}/100
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3">{a.description}</p>
                <div className="text-xs text-slate-300 space-y-1">
                  <div><strong className="text-rose-300">Likely entry:</strong> {a.likelyEntryPoint}</div>
                  <div><strong className="text-amber-300">Expected dwell:</strong> {a.expectedDwellTimeDays} days</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {scan.validation && scan.validation.verdicts.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">🛡 Validator subagent</div>
              <h2 className="text-lg font-bold text-slate-100 mt-1">Adversarial validation results</h2>
            </div>
            <span className="text-xs text-slate-400">Fresh-context disprove pass · Mythos pattern</span>
          </div>
          <p className="text-sm text-slate-300 mb-4">
            Every finding goes through an adversarial validator subagent that tries to <em>disprove</em> it. False positives are filtered by default.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-4">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">✅ Validated</div>
              <div className="text-3xl font-bold text-emerald-200">{scan.validation.summary.validated}</div>
              <div className="text-xs text-emerald-300/80 mt-1">Confirmed real and exploitable</div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">❌ False positive</div>
              <div className="text-2xl font-semibold text-slate-300">{scan.validation.summary.falsePositive}</div>
              <div className="text-xs text-slate-500 mt-1">Filtered from main findings</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">⚠ Needs review</div>
              <div className="text-2xl font-semibold text-amber-200">{scan.validation.summary.needsReview}</div>
              <div className="text-xs text-amber-300/70 mt-1">Manual investigation suggested</div>
            </div>
          </div>
        </section>
      )}

      {scan.genealogy && scan.genealogy.families.length > 0 && (
        <section className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-6">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold">📜 Vulnerability Genealogy</div>
              <h2 className="text-lg font-bold text-amber-200 mt-1">Bug families traced through history</h2>
            </div>
            <span className="text-xs text-amber-300/70">Modern bugs are old patterns wearing new CVE numbers</span>
          </div>
          <p className="text-sm text-slate-300 mb-5">
            For each finding pattern, we trace its lineage back to the earliest known instance, show how it mutated to bypass each round of fixes, and predict the next mutation.
          </p>
          <div className="space-y-5">
            {scan.genealogy.families.map((fam, i) => (
              <article key={i} className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-5">
                <h3 className="text-base font-bold text-amber-100 mb-3">{fam.familyName}</h3>
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-2">Lineage</div>
                  <ul className="space-y-1.5 text-sm">
                    {fam.lineage.map((l, j) => (
                      <li key={j} className="flex gap-3">
                        <span className="font-mono text-amber-300 shrink-0 w-12">{l.year}</span>
                        <div>
                          <span className="font-mono text-xs text-slate-500">{l.cveId}</span>
                          <span className="text-slate-300 ml-2">{l.summary}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded bg-slate-950/50 border border-slate-800 p-3">
                    <div className="text-slate-500 uppercase tracking-wider mb-1 text-[10px] font-semibold">How it mutated</div>
                    <p className="text-slate-300">{fam.evolution}</p>
                  </div>
                  <div className="rounded bg-rose-500/5 border border-rose-500/20 p-3">
                    <div className="text-rose-400 uppercase tracking-wider mb-1 text-[10px] font-semibold">Predicted next mutation</div>
                    <p className="text-slate-300">{fam.nextMutation}</p>
                  </div>
                </div>
                <div className="mt-3 rounded bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs">
                  <div className="text-emerald-400 uppercase tracking-wider mb-1 text-[10px] font-semibold">Defensive invariant (kills the entire family)</div>
                  <p className="text-slate-300">{fam.defensiveInvariant}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {scan.findings.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-lg font-bold">
              Findings · {visibleFindings.length}
              {showFpToggle && hideFalsePositives && fpCount > 0 && (
                <span className="ml-2 text-xs text-slate-500 font-normal">({fpCount} false {fpCount === 1 ? "positive" : "positives"} hidden)</span>
              )}
            </h2>
            {showFpToggle && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideFalsePositives}
                  onChange={(e) => setHideFalsePositives(e.target.checked)}
                  className="accent-emerald-500"
                />
                Hide false positives
              </label>
            )}
          </div>
          <div className="space-y-2">
            {(["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => {
              const items = grouped[sev] || [];
              if (items.length === 0) return null;
              return (
                <details key={sev} open={sev === "critical" || sev === "high"} className="border border-slate-800 rounded-lg">
                  <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/50">
                    <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${SEV_COLOR[sev]}`}>
                      {sev}
                    </span>
                    <span className="text-sm text-slate-300">{items.length} {items.length === 1 ? "finding" : "findings"}</span>
                  </summary>
                  <div className="px-4 py-3 space-y-2 border-t border-slate-800">
                    {items.map((f) => {
                      const verdict = findVerdict(verdictByFindingId, f.id);
                      return (
                        <article key={f.id} className="py-3 border-b border-slate-800 last:border-0">
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              {f.findingId && (
                                <span className="text-[10px] font-mono text-slate-500 font-semibold">{f.findingId}</span>
                              )}
                              <h4 className="font-semibold text-slate-100">{f.title}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              {verdict && (
                                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${VERDICT_PILL[verdict.verdict]}`}>
                                  {VERDICT_LABEL[verdict.verdict]}
                                </span>
                              )}
                              <span className="text-xs text-slate-500 font-mono">{f.scanner}</span>
                            </div>
                          </div>
                          {f.description && <p className="text-sm text-slate-400 mt-1 whitespace-pre-line">{f.description}</p>}
                          {f.shortTermFix && (
                            <div className="mt-2 px-3 py-2 rounded-md border-l-2 border-amber-500 bg-amber-500/5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-0.5">Fix this week</div>
                              <p className="text-sm text-amber-100">{f.shortTermFix}</p>
                            </div>
                          )}
                          {f.longTermFix && (
                            <div className="mt-2 px-3 py-2 rounded-md border-l-2 border-sky-500 bg-sky-500/5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300 mb-0.5">Fix this quarter</div>
                              <p className="text-sm text-sky-100">{f.longTermFix}</p>
                            </div>
                          )}
                          {!f.shortTermFix && f.recommendation && (
                            <div className="mt-2 px-3 py-2 rounded-md border-l-2 border-emerald-500 bg-emerald-500/5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-0.5">Recommended fix</div>
                              <p className="text-sm text-emerald-100">{f.recommendation}</p>
                            </div>
                          )}
                          {verdict && (
                            <p className="text-xs text-slate-500 mt-2 italic">
                              <span className="text-slate-400">Validator:</span> {verdict.reasoning}
                              {verdict.manualCheckNeeded && (
                                <> · <span className="text-amber-300/80">Check:</span> {verdict.manualCheckNeeded}</>
                              )}
                            </p>
                          )}
                          <div className="text-xs text-slate-500 mt-2 font-mono break-all">{f.affectedAsset}</div>
                          {f.cveId && (
                            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                              {f.cveId} · CVSS {f.cvssScore?.toFixed(1)}
                            </span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function groupBySeverity(findings: Scan["findings"]): Record<Severity, Scan["findings"]> {
  const out: Record<Severity, Scan["findings"]> = { critical: [], high: [], medium: [], low: [], info: [] };
  for (const f of findings) out[f.severity].push(f);
  return out;
}
