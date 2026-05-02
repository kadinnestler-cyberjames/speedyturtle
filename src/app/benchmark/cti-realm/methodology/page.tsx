import Link from "next/link";
import { Logo } from "@/components/Logo";

export const dynamic = "force-static";

export default function CtiRealmMethodologyPage() {
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

      <article className="max-w-3xl mx-auto px-6 pt-12 pb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Methodology · CTI-REALM
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          How we score speedyturtle on CTI-REALM
        </h1>
        <p className="text-slate-400 mb-10">
          Same dataset, same scorer, same tool registry as Mythos — only the agent loop changes.
          Mirrors{" "}
          <code className="text-amber-200 text-sm">scripts/README-cti-realm.md</code> in the repo.
        </p>

        <section className="space-y-4 text-slate-300 leading-relaxed">
          <H2>What CTI-REALM measures</H2>
          <p>
            CTI-REALM is Microsoft&apos;s end-to-end detection-rule generation benchmark, published in
            March 2026. Each task hands the agent a real cyber-threat-intelligence (CTI) report and asks
            it to produce a working Kusto query that detects the attacker behavior in a Kusto telemetry
            emulator. The benchmark is designed to be much harder than &quot;summarize this report&quot;
            evaluations — the agent has to read the CTI, map it to MITRE ATT&amp;CK, explore the
            telemetry schema, write a Kusto query, run it, and produce a final detection rule.
          </p>
          <p>The aggregate score (0–1) is a weighted sum across five checkpoints:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong className="text-amber-200">C0 · CTI Analysis (12.5%)</strong> — does the agent
              identify the right techniques and indicators from the report?
            </li>
            <li>
              <strong className="text-amber-200">C1 · MITRE Mapping (7.5%)</strong> — are the chosen
              ATT&amp;CK technique IDs correct?
            </li>
            <li>
              <strong className="text-amber-200">C2 · Data Exploration (10%)</strong> — does the agent
              query the schema before writing the rule?
            </li>
            <li>
              <strong className="text-amber-200">C3 · Query Execution (5%)</strong> — does the final
              query actually run against the Kusto emulator?
            </li>
            <li>
              <strong className="text-amber-200">C4 · Detection Quality (65%)</strong> — does the rule
              detect the seeded attack and avoid false positives in benign traffic?
            </li>
          </ul>
          <p>
            C4 dominates. A rule that compiles and runs against the schema but misses the attack scores
            far below a rule that catches the attack with low false-positive rate.
          </p>

          <H2>Why publish even a low score</H2>
          <p>
            Most benchmark posts cherry-pick. We&apos;d rather publish an honest first run with full
            methodology than a clean number with no audit trail. If a low score is what comes out of the
            harness, that&apos;s what goes on the page — the page literally refuses to render a numeric
            score until the wrapper records one. The wrapper, in turn, refuses to record a score unless
            the Inspect AI eval completes and the scorer produces at least one usable per-checkpoint or
            per-domain metric.
          </p>
          <p>
            That contract is enforced in{" "}
            <code className="text-amber-200 text-sm">scripts/run-cti-realm.py</code> and is not bypassable
            by the agent. See the &quot;Known limitations&quot; section below for the current degradations.
          </p>

          <H2>How the speedyturtle agent works</H2>
          <p>
            We swap the upstream <code className="text-amber-200 text-sm">react()</code> solver for a
            speedyturtle-specific ReAct loop implemented in TypeScript at{" "}
            <code className="text-amber-200 text-sm">src/lib/cti-realm/agent.ts</code>. The agent drives
            Claude Opus 4.7 (model literal <code className="text-amber-200 text-sm">claude-opus-4-7</code>)
            through a tool-use loop using <code className="text-amber-200 text-sm">@anthropic-ai/claude-agent-sdk</code>{" "}
            against the operator&apos;s Claude Pro/Max subscription via OAuth — no Anthropic API key
            required. Tool definitions are NOT defined in the agent — they come in over the stdio bridge
            from Inspect&apos;s tool registry. That means MITRE, Sigma, and Kusto tools all match the
            upstream task spec exactly, so our score is directly comparable to Mythos&apos;s published
            numbers.
          </p>
          <p className="text-amber-200/90">
            <strong>No-API-key path:</strong> the LLM-as-judge grader (C0 + C4) is forced onto an
            Anthropic model via Inspect AI&apos;s <code className="text-amber-200 text-sm">model_roles</code>{" "}
            override, and the OAuth access token is pulled from the macOS keychain entry that{" "}
            <code className="text-amber-200 text-sm">claude /login</code> writes. Both the agent and the
            scorer therefore bill against the operator&apos;s Claude subscription instead of an Anthropic
            API key. See <code className="text-amber-200 text-sm">scripts/with-claude-oauth.sh</code>.
          </p>
          <p>
            The bridge is NDJSON-over-stdio. Python (Inspect AI) launches{" "}
            <code className="text-amber-200 text-sm">npx tsx src/lib/cti-realm/agent.ts</code> with the
            task definition + tools schema on stdin. The TS agent emits tool requests on stdout. Python
            dispatches them into Inspect&apos;s registry and replays results back on the agent&apos;s
            stdin. When the agent emits a final response, Inspect&apos;s scorer runs end-to-end and
            writes both an{" "}
            <code className="text-amber-200 text-sm">.eval</code> log and a normalized row to{" "}
            <code className="text-amber-200 text-sm">data/cti-realm-scores.json</code>.
          </p>

          <H2>How to reproduce</H2>
          <p>The full chain — clone, install, download dataset, run.</p>
          <pre className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs leading-relaxed overflow-x-auto text-slate-200">
{`# 1. Clone
git clone <speedyturtle repo> && cd speedyturtle

# 2. Python venv (3.12 required for inspect-ai)
uv venv --python python3.12 .venv-cti-realm
source .venv-cti-realm/bin/activate
uv pip install inspect-ai 'inspect-evals[cti_realm]' anthropic

# 3. Node tooling (tsx is the only addition to package.json)
npm install --save-dev tsx@^4

# 4. Dataset
python -m inspect_evals.cti_realm.download_data

# 5. API key (real Anthropic key, sk-ant-...)
export ANTHROPIC_API_KEY=sk-ant-...

# 6. Smoke run — proves the bridge boots, no scoring
./scripts/run-cti-realm.py --smoke

# 7. Real run — minimal toolset on 5 samples
./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5

# 8. (For a publishable score) install Docker, drop --no-sandbox
brew install --cask docker && open -a Docker
./scripts/run-cti-realm.py --task cti_realm_25_minimal`}
          </pre>
          <p className="text-sm text-slate-400">
            Exit codes: <code className="text-amber-200">0</code> on success,{" "}
            <code className="text-amber-200">2</code> if{" "}
            <code className="text-amber-200">ANTHROPIC_API_KEY</code> is missing,{" "}
            <code className="text-amber-200">5</code> on mid-run errors. The full README for the harness
            lives at <code className="text-amber-200">scripts/README-cti-realm.md</code> in the repo.
          </p>

          <H2>Known limitations</H2>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              <strong className="text-amber-200">No Docker → degraded toolchain.</strong> CTI-REALM&apos;s
              tasks pin{" "}
              <code className="text-sm text-amber-200">sandbox=(&quot;docker&quot;, compose.yaml)</code>,
              which boots a Kusto emulator on{" "}
              <code className="text-sm text-amber-200">kusto-emulator:8080</code> and a MITRE service on{" "}
              <code className="text-sm text-amber-200">mitre-service:8081</code>. Without Docker installed
              locally, our wrapper rewrites <code className="text-sm text-amber-200">sandbox=None</code>{" "}
              so the harness boots, but every tool that targets those service hostnames fails at the
              network layer. C2/C3 effectively zero. C4 detection-quality close to zero (no query results
              to score). To produce a publishable comparison against Mythos, install Docker Engine and
              drop the <code className="text-sm text-amber-200">--no-sandbox</code> flag.
            </li>
            <li>
              <strong className="text-amber-200">Sonnet 4.6 baseline pending.</strong> The comparison row
              for Claude Sonnet 4.6 on the scoreboard is marked &quot;Pending — to be measured&quot;
              because we haven&apos;t yet run it. Once we do, it will appear next to speedyturtle and
              Mythos with the same caveats applied.
            </li>
            <li>
              <strong className="text-amber-200">Smoke vs full eval.</strong>{" "}
              <code className="text-sm text-amber-200">--smoke</code> evaluates 1 synthetic sample to
              prove the bridge boots — it bypasses the cti_realm scorer and writes nothing to{" "}
              <code className="text-sm text-amber-200">cti-realm-scores.json</code>. Real published scores
              come only from <code className="text-sm text-amber-200">--task cti_realm_25_minimal</code>{" "}
              (or one of the larger variants).
            </li>
            <li>
              <strong className="text-amber-200">Score JSON is append-only.</strong> The harness never
              rewrites past entries. To replace a row, edit by hand.
            </li>
            <li>
              <strong className="text-amber-200">HF dataset download is unauthenticated.</strong> Today
              the public revision works without a token. If Hugging Face throttles or moves the dataset
              behind auth, set <code className="text-sm text-amber-200">HF_TOKEN</code> and re-run.
            </li>
          </ol>

          <H2>Source</H2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Upstream benchmark:{" "}
              <a
                href="https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/cti_realm"
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:text-amber-200 underline"
              >
                inspect_evals/cti_realm ↗
              </a>
            </li>
            <li>
              Microsoft research blog:{" "}
              <a
                href="https://www.microsoft.com/en-us/security/blog/2026/03/20/cti-realm-a-new-benchmark-for-end-to-end-detection-rule-generation-with-ai-agents/"
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:text-amber-200 underline"
              >
                CTI-REALM announcement ↗
              </a>
            </li>
            <li>
              Speedyturtle agent:{" "}
              <code className="text-amber-200 text-sm">src/lib/cti-realm/agent.ts</code> (described above
              — public link will be added when the repo is opened)
            </li>
          </ul>
        </section>

        <div className="mt-12 pt-8 border-t border-slate-800">
          <Link
            href="/benchmark/cti-realm"
            className="text-amber-300 hover:text-amber-200 font-semibold"
          >
            ← Back to scoreboard
          </Link>
        </div>
      </article>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500">
          © {new Date().getFullYear()} speedyturtle. Part of the Tilacum stack.
        </div>
      </footer>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-slate-100 mt-8 mb-2">{children}</h2>;
}
