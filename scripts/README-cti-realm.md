# CTI-REALM benchmark — speedyturtle harness

This directory contains the speedyturtle integration of Microsoft's [CTI-REALM](https://www.microsoft.com/en-us/security/blog/2026/03/20/cti-realm-a-new-benchmark-for-end-to-end-detection-rule-generation-with-ai-agents/) benchmark, packaged from the open-source [`inspect_evals.cti_realm`](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/cti_realm) module. We swap the upstream `react()` solver for our own ReAct loop — `runCtiRealmAgent()` — so we can publish reproducible CTI-REALM scores against the same dataset, scorer, and tool registry as Mythos and other published systems.

The two artifacts:

- `src/lib/cti-realm/agent.ts` — TypeScript agent. Drives Claude (`claude-opus-4-7` literal) through a tool-use loop using `@anthropic-ai/sdk`. Tool definitions are passed in by the caller; the agent never invents tools. Exposes both a programmatic API (`runCtiRealmAgent`) and an NDJSON-over-stdio CLI used by the Python solver bridge.
- `scripts/run-cti-realm.py` — Python harness. Registers an Inspect AI solver named `speedyturtle_cti_realm_solver`, spawns the TS agent via `npx tsx`, proxies tool calls back into Inspect's tool registry, and writes a normalized score row to `data/cti-realm-scores.json`.

---

## Environment

| Component | Where | Notes |
|---|---|---|
| `node` (>= 20) | `/Users/kadinnestler/local/bin/node` | Not on default `$PATH`. Prepend or invoke directly. |
| `npx` | `/Users/kadinnestler/local/bin/npx` | The `npm` shim next to it is broken (missing `index.js`). Use `node /Users/kadinnestler/local/lib/node_modules/npm/bin/npm-cli.js` for npm operations. |
| Python 3.12 | `/Users/kadinnestler/.local/bin/python3.12` | Default `python3` is 3.9 — too old for `inspect-ai`. |
| `uv` | `/Users/kadinnestler/.local/bin/uv` | Used to install the venv. |
| Docker | not installed | CTI-REALM's tasks pin `sandbox=("docker", ...)`. We override with `--no-sandbox` (see Limitations). |

### Required environment variables

| Name | Required for | Source |
|---|---|---|
| `ANTHROPIC_API_KEY` | every real run | Source `~/.config/secrets.env`. As of this writing the line is commented out — the smoke run will exit 2 with a clear blocker until you uncomment + populate it. |
| `HF_TOKEN` | (optional) re-downloads of the dataset | The current dataset (`arjun180-new/cti_realm`, revision `0fa6744b…`) downloads cleanly without auth. |
| `INSPECT_LOG_DIR` | (optional) | Defaults to `data/inspect-logs/`. |
| `NODE_BIN` | (optional) | Override the `node` binary path used by the Python solver. Defaults to PATH lookup, then `/usr/local/bin/node` and `/opt/homebrew/bin/node`. |
| `NPX_BIN` | (optional) | Override the `npx` binary path used by the Python solver. Same fallback chain as `NODE_BIN`. |
| `CRON_SECRET` | the `/api/benchmark/cti-realm/refresh` route in production | Vercel project env var. Must match the secret Vercel Cron sends in `Authorization: Bearer …`. |

---

## Install

```bash
# Python venv
uv venv --python /Users/kadinnestler/.local/bin/python3.12 .venv-cti-realm
source .venv-cti-realm/bin/activate
uv pip install inspect-ai 'inspect-evals[cti_realm]' anthropic

# Node tooling — tsx is the only addition we made to package.json (devDep).
node /Users/kadinnestler/local/lib/node_modules/npm/bin/npm-cli.js install --save-dev tsx@^4
```

> **Note on the install string:** `pip install 'inspect-evals[cti_realm]'` emits a warning because `inspect-evals` doesn't actually publish a `cti_realm` extra (`The package inspect-evals==0.10.1 does not have an extra named cti-realm`). The base package nevertheless ships the `inspect_evals.cti_realm` subpackage and all its dependencies. The install completes successfully.

## Download the dataset

```bash
source .venv-cti-realm/bin/activate
python -m inspect_evals.cti_realm.download_data
```

Files land alongside the `inspect_evals` install:

```
.venv-cti-realm/lib/python3.12/site-packages/inspect_evals/cti_realm/
  data/                      # 8 dataset files (~100 KB total)
  docker/kusto_init/data/    # 12 Kusto telemetry files (~50–500 MB total)
  cti_reports/reports.jsonl  # CTI report corpus
```

The download is unauthenticated against the public HF revision and completes in 30–90 s on a fast connection.

---

## Reproduce a benchmark run

The block below is the exact set of commands the public scoreboard at
`/benchmark/cti-realm` renders under "Reproduce" — keep this in sync with
`src/app/benchmark/cti-realm/page.tsx`.

```bash
# 1. Clone speedyturtle
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
./scripts/run-cti-realm.py --task cti_realm_25_minimal
```

### Smoke run (1 sample, no scoring)

This proves the plumbing — TS agent boot, Anthropic SDK init, Inspect solver registration — without claiming a score.

```bash
source ~/.config/secrets.env  # must export ANTHROPIC_API_KEY
source .venv-cti-realm/bin/activate
./scripts/run-cti-realm.py --smoke
```

Exit codes:

- `0` — agent ran end-to-end, no score recorded (intentional)
- `2` — `ANTHROPIC_API_KEY` not set / does not start with `sk-`
- `5` — eval errored mid-run (see stderr; the `.eval` log is preserved)

### Full benchmark — minimal toolset variant

```bash
./scripts/run-cti-realm.py --task cti_realm_25_minimal --no-sandbox
```

Other variants: `cti_realm_25`, `cti_realm_50`, `cti_realm_25_seeded`. Without Docker, only the `*_minimal` variant has any chance of producing a non-zero score (see Limitations); even there, the Kusto-emulator-dependent tools will fail at the network layer.

### Output

The script writes two artifacts:

- `data/inspect-logs/<run-id>.eval` — Inspect AI's native log (zip archive of trajectories + scorer output). Read with `inspect view <path>` or programmatically via `inspect_ai.log.read_eval_log`.
- `data/cti-realm-scores.json` — append-only history of normalized scores:

  ```json
  {
    "history": [
      {
        "run_id": "2026-04-30T22-50-00",
        "task": "cti_realm_25_minimal",
        "model": "claude-opus-4-7",
        "score": 0.0,
        "per_checkpoint": {"C0": 0.0, "C1": 0.0, "C2": 0.0, "C3": 0.0, "C4": 0.0},
        "per_domain": {"aks": 0.0, "linux": 0.0, "cloud": 0.0},
        "samples_run": 25,
        "samples_total": 25,
        "inspect_log": "data/inspect-logs/2026-04-30T22-50-00.eval"
      }
    ]
  }
  ```

A row is written **only** if the eval completes successfully and the scorer produces at least one usable per-checkpoint or per-domain metric. If everything zeroes out (typically because the agent failed to make tool calls or the parser couldn't read the agent's JSON), the script exits non-zero and refuses to record a score. This is the contract that keeps `cti-realm-scores.json` honest.

---

## How the bridge works

```
┌──────────────────────────┐  Inspect Task launches solver
│ inspect eval (Python)    │
│   speedyturtle_cti_realm │
│   _solver                │
└──────────┬───────────────┘
           │ stdin: {"type":"init","ctiReport":"…","tools":[…]}
           ▼
┌──────────────────────────┐  npx tsx src/lib/cti-realm/agent.ts
│ runCtiRealmAgent (TS)    │     --report-from-stdin --tools-from-stdin
│   Anthropic SDK          │
│   tool-use ReAct loop    │
└──────────┬───────────────┘
           │ stdout: NDJSON events
           │   { type: "tool_request", id, name, input }
           │   { type: "iteration", n, stopReason }
           │   { type: "final", result }
           ▼
┌──────────────────────────┐
│ Python solver dispatches │  re-injects tool result on agent stdin:
│ each tool call into the  │     { type: "tool_result", id, content,
│ Inspect tool registry    │       isError: false }
└──────────────────────────┘
```

Per the ticket, the TS agent does NOT define MITRE/Sigma/Kusto tools itself — Inspect's CTI-REALM task registry owns those, and the Python bridge proxies them. This keeps the eval reproducible against upstream and means a published score can credibly be compared against Mythos's 0.624–0.685 range without methodology drift.

The model literal is `claude-opus-4-7`. The Anthropic SDK accepts arbitrary strings; if the API rejects the alias at runtime (404 model-not-found), the agent emits a `model_swap` event and retries once with `claude-opus-4-7` (the dated build of Opus 4.7 already imported elsewhere in this codebase).

---

## Public scoreboard

The benchmark has a public surface at [`/benchmark/cti-realm`](https://speedyturtle-smb.vercel.app/benchmark/cti-realm) (and on localhost during dev).

What the scoreboard renders:

- **Hero / score card.** Speedyturtle's latest score from `data/cti-realm-scores.json`. When the file is missing or has no completed runs, it renders an `AWAITING_FIRST_RUN` block with the four-step unblock sequence (API key → Docker → run script → cron picks it up). It does NOT show a placeholder number.
- **Comparison table.** Speedyturtle (latest), Mythos (Microsoft's published 0.624–0.685 range with citation), and Claude Sonnet 4.6 baseline marked "Pending — to be measured".
- **Per-domain breakdown.** Linux, AKS, Cloud — only rendered when the score JSON has `per_domain` populated. Shows speedyturtle alongside Microsoft's published Mythos per-domain aggregates (Linux 0.585, AKS 0.517, Cloud 0.282).
- **Per-checkpoint breakdown.** C0–C4, only rendered when present in the JSON. Weights: 12.5% / 7.5% / 10% / 5% / 65%.
- **Methodology section.** Short prose on the page + link to `/benchmark/cti-realm/methodology`, which mirrors this README.
- **Reproducibility section.** Inline `<pre>` with the exact clone-and-run commands.
- **Run history.** Last 10 entries from `history`.

The page is a Next 16 server component at `src/app/benchmark/cti-realm/page.tsx`. It reads `data/cti-realm-scores.json` via `fs/promises` at request time, so a new run committed to git is reflected on the next deploy.

### What the cron does today

`vercel.json` schedules `/api/benchmark/cti-realm/refresh` every day at 07:00 UTC. The route handler at `src/app/api/benchmark/cti-realm/refresh/route.ts` exposes:

- `GET` — public read. Returns the current `cti-realm-scores.json` as JSON, with a short `s-maxage=60, stale-while-revalidate=300` cache. When the file is missing, returns `{"history":[],"status":"awaiting-first-run"}`.
- `POST` — cron + future-worker hook. Verifies `Authorization: Bearer ${CRON_SECRET}` (Vercel's standard pattern; falls back to `x-cron-secret` for local testing). On valid auth: re-reads the score file, logs the refresh, returns the latest entry. Sets `Cache-Control: no-store`.

The `POST` does NOT run the benchmark inline. It can't:

1. Vercel serverless functions cap at 5 minutes; the eval runs longer.
2. There is no Docker in the serverless runtime, and the eval pins `sandbox=("docker", compose.yaml)`. Without Docker, the Kusto emulator + MITRE service tools can't boot inside a Vercel function.

The realistic flow today is: developer runs the benchmark locally → checks the updated `cti-realm-scores.json` into git → Vercel rebuilds → the public page picks up the new score. The cron's job is to keep edge caches warm and to be a stable hook for the next iteration.

In production (`VERCEL_ENV=production` or `NODE_ENV=production`), if `CRON_SECRET` is unset or empty, `POST` fails closed with HTTP 503 (`{"error":"CRON_SECRET not configured — refresh endpoint disabled until env var is set"}`). In dev/preview the route falls back to the legacy unauthenticated pass-through but emits a one-time `console.warn`. This guarantees a forgotten production env var cannot result in an open trigger endpoint.

### What the next iteration should do

Wire `POST` to dispatch a remote benchmark worker (a process running on a real machine with Docker installed). The cron fires nightly at 07:00 UTC; the route POSTs to the worker (with a separate `BENCHMARK_WORKER_URL` + worker-specific secret); the worker runs the eval; when complete, the worker either commits the updated `cti-realm-scores.json` directly to the repo (preferred, stays consistent with the static-file model) or POSTs the new row to a `cti-realm/ingest` endpoint that writes to Vercel KV / Postgres for hot reads. The current code is structured so that adding the worker dispatch is a localized change to the `POST` handler — the `GET`, page, and history rendering all stay exactly the same.

Until then, treat the cron as a heartbeat that proves the route is reachable and that the score file is parseable.

### Deploy checklist

Before the first production deploy of the CTI-REALM scoreboard, confirm:

- [ ] Set `CRON_SECRET` in the Vercel project env (Production + Preview). Without it, POST is intentionally disabled in production (HTTP 503).
- [ ] Set `ANTHROPIC_API_KEY` in the Vercel project env if/when the remote benchmark worker is wired (the cron route does not call the API today, but the future worker dispatch will).
- [ ] Verify `vercel.json` cron schedules are imported on the next deploy (`/api/blue-team/monitor/run` at 06:00 UTC + `/api/benchmark/cti-realm/refresh` at 07:00 UTC).
- [ ] Confirm `data/cti-realm-scores.json` is committed (git tracking) — that file is the source of truth the page reads. Vercel functions are stateless, so a missing or untracked file means the page falls back to the `AWAITING_FIRST_RUN` state regardless of any prior local runs.

---

## Known limitations

1. **No Docker → no real Kusto emulator.** CTI-REALM's task spec hard-codes `sandbox=("docker", "compose.yaml")`, which boots a Kusto emulator on `kusto-emulator:8080`, a MITRE service on `mitre-service:8081`, and a sandboxed bash/python environment. Without Docker, our wrapper rewrites `sandbox=None` so the harness boots, but every tool that targets those service hostnames fails at the network layer. Expected impact:

   | Variant | Without Docker |
   |---|---|
   | `cti_realm_25` | C2/C3 effectively zero; C4 detection quality close to zero (no query results to score). |
   | `cti_realm_50` | Same. |
   | `cti_realm_25_minimal` | Same — even though it removes MITRE/Sigma tools, it still depends on Kusto for execution. |
   | `cti_realm_25_seeded` | Same. |

   To produce a publishable score, install Docker Engine, drop the `--no-sandbox` flag, and let the docker-compose stack boot the emulator services.

2. **HF download is unauthenticated.** This works today against the public revision but may break if Hugging Face throttles or the dataset moves behind auth. If `download_data.py` fails, add `HF_TOKEN` to `~/.config/secrets.env` and re-run.

3. **Score JSON is append-only.** `cti-realm-scores.json` is intended for trend tracking. To replace a row, edit by hand — the script never rewrites past entries.

4. **Smoke run uses a synthetic sample.** `--smoke` evaluates 1 trivial input designed to exercise the bridge, not the real benchmark dataset. It deliberately bypasses the cti_realm scorer and writes nothing to `cti-realm-scores.json`.

5. **`inspect-evals[cti_realm]` install warning.** The extra doesn't exist; the base install is sufficient. If a future `inspect-evals` release adds a real extra, the install string above will need updating.

6. **`inspect eval` CLI cannot directly resolve the cti_realm task by short name.** Use the wrapper script. The full file path form (`inspect eval /path/to/cti_realm.py@cti_realm_25_minimal`) loads the task but then trips on the docker sandbox spec because the CLI doesn't accept `--sandbox none`.

---

## Provenance

- Upstream benchmark: <https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/cti_realm>
- Microsoft research blog: <https://www.microsoft.com/en-us/security/blog/2026/03/20/cti-realm-a-new-benchmark-for-end-to-end-detection-rule-generation-with-ai-agents/>
- Tickets: `vault/clients/speedyturtle-cti-realm/tickets/T-001-build-agent.md`, `T-002-bootstrap-env.md`, `T-004-scoreboard-page.md`, `T-005-refresh-cron.md`
