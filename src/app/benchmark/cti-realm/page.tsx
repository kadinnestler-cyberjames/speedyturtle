import Link from "next/link";
import fs from "node:fs/promises";
import path from "node:path";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

// Mythos published numbers — Microsoft's CTI-REALM blog, 2026-03-20.
// https://www.microsoft.com/en-us/security/blog/2026/03/20/cti-realm-a-new-benchmark-for-end-to-end-detection-rule-generation-with-ai-agents/
const MYTHOS = {
  rangeLow: 0.624,
  rangeHigh: 0.685,
  perDomain: { linux: 0.585, aks: 0.517, cloud: 0.282 },
  sourceUrl:
    "https://www.microsoft.com/en-us/security/blog/2026/03/20/cti-realm-a-new-benchmark-for-end-to-end-detection-rule-generation-with-ai-agents/",
};

// Per-checkpoint weights, per CTI-REALM spec / Microsoft blog.
const CHECKPOINTS: { id: string; label: string; weightPct: number }[] = [
  { id: "C0", label: "CTI Analysis", weightPct: 12.5 },
  { id: "C1", label: "MITRE Mapping", weightPct: 7.5 },
  { id: "C2", label: "Data Exploration", weightPct: 10 },
  { id: "C3", label: "Query Execution", weightPct: 5 },
  { id: "C4", label: "Detection Quality", weightPct: 65 },
];

type ScoreEntry = {
  run_id: string;
  task: string;
  model?: string;
  score: number | null;
  per_checkpoint?: Partial<Record<"C0" | "C1" | "C2" | "C3" | "C4", number>>;
  per_domain?: Partial<Record<"linux" | "aks" | "cloud", number>>;
  samples_run?: number;
  samples_total?: number;
  inspect_log?: string;
};

type ScoreFile = {
  history?: ScoreEntry[];
  status?: string;
};

async function readScores(): Promise<{ data: ScoreFile; missing: boolean; error?: string }> {
  const fp = path.join(process.cwd(), "data", "cti-realm-scores.json");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return { data: { history: [] }, missing: true };
    const parsed = JSON.parse(trimmed) as ScoreFile;
    return { data: parsed, missing: false };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") return { data: { history: [] }, missing: true };
    return { data: { history: [] }, missing: true, error: e?.message ?? String(err) };
  }
}

function fmtScore(s: number | null | undefined): string {
  if (s === null || s === undefined || Number.isNaN(s)) return "—";
  return s.toFixed(3);
}

export default async function CtiRealmScoreboardPage() {
  const { data, missing, error } = await readScores();
  const history = (data.history ?? []).filter((e) => e && typeof e.score === "number");
  const latest = history.length > 0 ? history[history.length - 1] : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight flex items-center gap-2">
            <Logo size={28} />
            <span className="text-emerald-400">speedyturtle</span>
          </Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
            <Link href="/blue-team" className="text-slate-300 hover:text-white">Blue Team</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
            <Link href="/benchmark/cti-realm" className="text-amber-400 font-semibold">CTI-REALM</Link>
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Public benchmark · CTI-REALM · Reproducible
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          speedyturtle on
          <br />
          <span className="text-amber-400">CTI-REALM.</span>
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-3xl">
          End-to-end detection-rule generation, scored against Microsoft&apos;s public benchmark. Same dataset,
          same scorer, same tool registry as Mythos. Our agent: Claude Opus 4.5 in a ReAct loop.{" "}
          <Link href="/benchmark/cti-realm/methodology" className="text-amber-300 hover:text-amber-200 underline">
            Methodology →
          </Link>
        </p>
      </section>

      {/* Hero score card */}
      <section className="max-w-5xl mx-auto px-6 pb-10">
        {latest ? (
          <LatestScoreCard entry={latest} />
        ) : (
          <AwaitingFirstRun error={error} missing={missing} />
        )}
      </section>

      {/* Comparison table */}
      <section className="max-w-5xl mx-auto px-6 py-6">
        <h2 className="text-2xl font-bold mb-2">Comparison</h2>
        <p className="text-slate-400 mb-5 text-sm">
          Aggregate CTI-REALM score (0–1, weighted across the 5 checkpoints). Mythos numbers cite Microsoft&apos;s
          public range on CTI-REALM-50.
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">System</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr className="bg-amber-500/5">
                <td className="px-4 py-3 font-semibold text-amber-200">speedyturtle (latest)</td>
                <td className="px-4 py-3 font-mono text-lg">
                  {latest ? fmtScore(latest.score) : <span className="text-slate-500">awaiting first run</span>}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {latest
                    ? `${latest.task} · ${latest.model ?? "claude-opus-4-7"} · ${latest.samples_run ?? "?"}/${latest.samples_total ?? "?"} samples`
                    : "Operator must add ANTHROPIC_API_KEY + Docker. See unblock instructions above."}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Mythos (Microsoft)</td>
                <td className="px-4 py-3 font-mono text-lg">
                  {MYTHOS.rangeLow.toFixed(3)} – {MYTHOS.rangeHigh.toFixed(3)}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  Published range on CTI-REALM-50.{" "}
                  <a
                    href={MYTHOS.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-300 hover:text-amber-200 underline"
                  >
                    source
                  </a>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-300">Claude Sonnet 4.5 (external baseline)</td>
                <td className="px-4 py-3 font-mono text-slate-500">Pending — to be measured</td>
                <td className="px-4 py-3 text-slate-400 text-xs">Not yet run. Planned next iteration.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-domain breakdown — only when we have it */}
      {latest?.per_domain && Object.keys(latest.per_domain).length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-6">
          <h2 className="text-2xl font-bold mb-2">Per-domain breakdown</h2>
          <p className="text-slate-400 mb-5 text-sm">
            CTI-REALM splits the dataset across three telemetry domains. Microsoft&apos;s published per-domain numbers
            are aggregate Mythos scores, shown for context.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <DomainCard
              label="Linux endpoint"
              ours={latest.per_domain.linux}
              mythos={MYTHOS.perDomain.linux}
            />
            <DomainCard label="AKS" ours={latest.per_domain.aks} mythos={MYTHOS.perDomain.aks} />
            <DomainCard label="Cloud" ours={latest.per_domain.cloud} mythos={MYTHOS.perDomain.cloud} />
          </div>
        </section>
      )}

      {/* Per-checkpoint breakdown — only when we have it */}
      {latest?.per_checkpoint && Object.keys(latest.per_checkpoint).length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-6">
          <h2 className="text-2xl font-bold mb-2">Per-checkpoint breakdown</h2>
          <p className="text-slate-400 mb-5 text-sm">
            CTI-REALM scores aggregate as a weighted sum across five checkpoints. C4 (Detection Quality) drives
            65% of the final score.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {CHECKPOINTS.map((cp) => {
              const v = latest.per_checkpoint?.[cp.id as keyof typeof latest.per_checkpoint];
              return (
                <div
                  key={cp.id}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                >
                  <div className="text-xs uppercase tracking-wider text-slate-500">
                    {cp.id} · {cp.weightPct}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{cp.label}</div>
                  <div className="text-2xl font-mono font-bold mt-2 text-amber-300">{fmtScore(v)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Methodology — short prose */}
      <section className="max-w-5xl mx-auto px-6 py-6">
        <h2 className="text-2xl font-bold mb-3">Methodology</h2>
        <div className="prose-sm space-y-3 text-slate-300 max-w-3xl">
          <p>
            CTI-REALM is Microsoft&apos;s end-to-end detection-rule generation benchmark. Each task gives the
            agent a real cyber-threat-intelligence (CTI) report and asks it to produce a working Kusto query
            that detects the described attacker behavior in a Kusto telemetry emulator. The score is a weighted
            average across five checkpoints — CTI analysis (12.5%), MITRE mapping (7.5%), data exploration (10%),
            query execution (5%), and detection quality (65%).
          </p>
          <p>
            We run the upstream{" "}
            <code className="text-amber-200">inspect_evals.cti_realm</code> task with one substitution: our
            ReAct solver (
            <code className="text-amber-200">src/lib/cti-realm/agent.ts</code>) replaces the default
            <code className="text-amber-200"> react()</code> solver. Tool definitions still come from the upstream
            registry — we don&apos;t hand-roll MITRE, Sigma, or Kusto tools. That keeps our score directly
            comparable to Mythos.
          </p>
          <p>
            We publish this even when the score is low. A low honest score with full methodology is more useful
            to other practitioners than a high curated number. The current degradations: (1) no Docker locally,
            so the Kusto-emulator and MITRE-service tools fail at the network layer — see the no-sandbox column
            in the methodology page; and (2) we haven&apos;t yet run external Sonnet 4.5 as a baseline, so the
            comparison row is marked pending.
          </p>
        </div>
        <Link
          href="/benchmark/cti-realm/methodology"
          className="inline-block mt-4 px-5 py-2 rounded-lg border border-amber-500/40 text-amber-300 hover:border-amber-400 hover:text-amber-200 text-sm font-semibold"
        >
          Full methodology →
        </Link>
      </section>

      {/* Reproducibility */}
      <section className="max-w-5xl mx-auto px-6 py-6">
        <h2 className="text-2xl font-bold mb-2">Reproduce</h2>
        <p className="text-slate-400 mb-4 text-sm">
          Every command needed to rerun this benchmark from scratch. No private data, no proprietary tooling.
        </p>
        <pre className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs leading-relaxed overflow-x-auto text-slate-200">
{`# 1. Clone speedyturtle
git clone <speedyturtle repo> && cd speedyturtle

# 2. Create the Python venv (Python 3.12 required for inspect-ai)
uv venv --python python3.12 .venv-cti-realm
source .venv-cti-realm/bin/activate
uv pip install inspect-ai 'inspect-evals[cti_realm]' anthropic

# 3. Install Node tooling (tsx for the TS agent bridge)
npm install --save-dev tsx@^4

# 4. Download the CTI-REALM dataset
python -m inspect_evals.cti_realm.download_data

# 5. Set the API key (real Anthropic key, starts with sk-ant-)
export ANTHROPIC_API_KEY=sk-ant-...

# 6. Smoke-run the bridge (1 synthetic sample, no scoring)
./scripts/run-cti-realm.py --smoke

# 7. Real run — minimal toolset variant on 5 samples
./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5

# 8. (Optional, for a publishable score) Boot Docker, then drop --no-sandbox
brew install --cask docker && open -a Docker
./scripts/run-cti-realm.py --task cti_realm_25_minimal`}
        </pre>
      </section>

      {/* Run history */}
      <section className="max-w-5xl mx-auto px-6 py-6">
        <h2 className="text-2xl font-bold mb-2">Run history</h2>
        <p className="text-slate-400 mb-4 text-sm">
          Last 10 runs from <code className="text-amber-200">data/cti-realm-scores.json</code>. Append-only —
          old rows are never rewritten.
        </p>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-500 text-sm">
            No runs recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Run ID</th>
                  <th className="text-left px-4 py-3">Task</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Samples</th>
                  <th className="text-left px-4 py-3">Inspect log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.slice(-10).reverse().map((entry) => (
                  <tr key={entry.run_id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{entry.run_id}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.task}</td>
                    <td className="px-4 py-3 font-mono text-amber-300">{fmtScore(entry.score)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {entry.samples_run ?? "?"}/{entry.samples_total ?? "?"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                      {entry.inspect_log ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
          <div>© {new Date().getFullYear()} speedyturtle. Part of the Tilacum stack.</div>
          <div className="flex gap-4">
            <a
              href="https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/cti_realm"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300"
            >
              inspect_evals.cti_realm ↗
            </a>
            <Link href="/benchmark/cti-realm/methodology" className="hover:text-slate-300">
              Methodology
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function LatestScoreCard({ entry }: { entry: ScoreEntry }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8">
      <div className="text-xs uppercase tracking-wider text-amber-300 font-semibold mb-2">
        Latest speedyturtle score
      </div>
      <div className="flex items-end gap-4">
        <div className="text-6xl md:text-7xl font-bold font-mono text-amber-200 leading-none">
          {fmtScore(entry.score)}
        </div>
        <div className="text-slate-400 text-sm pb-2">
          <div>{entry.task}</div>
          <div className="text-xs">
            {entry.model ?? "claude-opus-4-7"} · {entry.samples_run ?? "?"}/{entry.samples_total ?? "?"} samples
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">{entry.run_id}</div>
        </div>
      </div>
    </div>
  );
}

function AwaitingFirstRun({ missing, error }: { missing: boolean; error?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-8">
      <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-200 text-xs font-bold uppercase tracking-wider mb-4">
        AWAITING_FIRST_RUN
      </div>
      <h2 className="text-2xl font-bold text-amber-100 mb-3">No real run yet — and we won&apos;t fake one.</h2>
      <p className="text-slate-300 mb-5 max-w-2xl">
        <code className="text-amber-200">data/cti-realm-scores.json</code>{" "}
        {missing ? "does not exist" : "exists but is empty"}. The benchmark wrapper is hardened to refuse to
        record a score unless the eval completes and the scorer produces a usable metric. Until the operator
        unblocks the prerequisites below, this page shows nothing where a number would normally go.
        {error ? <span className="text-rose-300 block mt-2 text-xs">Read error: {error}</span> : null}
      </p>
      <div className="space-y-3">
        <UnblockStep
          n={1}
          title="Provide an Anthropic API key"
          body={
            <>
              Edit <code className="text-amber-200">~/.config/secrets.env</code>, uncomment line 10, and paste a
              working key (starts with <code className="text-amber-200">sk-ant-</code>). The agent calls Claude
              Opus 4.5 — without a key it has nothing to call.
            </>
          }
        />
        <UnblockStep
          n={2}
          title="Install Docker Engine (for a publishable score)"
          body={
            <>
              <code className="text-amber-200">brew install --cask docker</code>, then launch Docker Desktop.
              CTI-REALM&apos;s tasks pin <code className="text-amber-200">sandbox=(&quot;docker&quot;, compose.yaml)</code>.
              Without Docker, the Kusto emulator + MITRE service tools fail at the network layer and the score
              is ~0 — still an honest baseline, but not a fair Mythos comparison.
            </>
          }
        />
        <UnblockStep
          n={3}
          title="Run the benchmark"
          body={
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs overflow-x-auto text-slate-200 mt-2">
{`source ~/.config/secrets.env
./scripts/run-cti-realm.py --smoke
./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5`}
            </pre>
          }
        />
        <UnblockStep
          n={4}
          title="Cron picks it up"
          body={
            <>
              The Vercel cron at <code className="text-amber-200">/api/benchmark/cti-realm/refresh</code> fires
              nightly at 07:00 UTC. After the score JSON is committed and Vercel rebuilds, this page picks up
              the new run automatically.
            </>
          }
        />
      </div>
    </div>
  );
}

function UnblockStep({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-200 text-sm font-bold">
        {n}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-slate-100">{title}</div>
        <div className="text-sm text-slate-300 mt-1">{body}</div>
      </div>
    </div>
  );
}

function DomainCard({
  label,
  ours,
  mythos,
}: {
  label: string;
  ours: number | undefined;
  mythos: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-3">
        <div className="text-3xl font-mono font-bold text-amber-300">{fmtScore(ours)}</div>
        <div className="text-xs text-slate-500 mt-1">speedyturtle</div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-800">
        <div className="text-xl font-mono text-slate-300">{mythos.toFixed(3)}</div>
        <div className="text-xs text-slate-500 mt-1">Mythos (aggregate)</div>
      </div>
    </div>
  );
}
