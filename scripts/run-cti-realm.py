#!/usr/bin/env python3
"""Run the CTI-REALM benchmark with a Speedy Turtle TypeScript ReAct agent.

The Microsoft CTI-REALM benchmark ships in `inspect_evals.cti_realm`. Its
default solver uses Inspect AI's `react` agent. This script swaps that out for
a custom solver that hands every sample's CTI report + the eval's own tool
registry to a TypeScript ReAct loop running under tsx, then proxies tool calls
back into Inspect's tool registry over a JSON-over-stdio bridge.

The TypeScript bridge lives at `src/lib/cti-realm/agent.ts`.

Usage:

    # Smoke run — 1 sample, no scoring requirement, no sandbox.
    ./scripts/run-cti-realm.py --smoke

    # Full task run.
    ./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5

    # Skip sandbox entirely (Docker not installed).
    ./scripts/run-cti-realm.py --no-sandbox

Environment:

    ANTHROPIC_API_KEY   Required. Source ~/.config/secrets.env.
    HF_TOKEN            Optional. Only needed for re-downloads of the dataset.
    INSPECT_LOG_DIR     Optional. Defaults to data/inspect-logs/.
    NODE_BIN            Optional. Override the node binary path (otherwise we
                        try PATH then well-known system locations).
    NPX_BIN             Optional. Same idea for npx.

Outputs:

    data/inspect-logs/<run_id>.eval        Inspect AI's native log
    data/cti-realm-scores.json             Normalized score history (append-only)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# ----------------------------------------------------------------------------
# Repo paths
# ----------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
INSPECT_LOG_DIR = Path(os.environ.get("INSPECT_LOG_DIR", DATA_DIR / "inspect-logs"))
SCORES_FILE = DATA_DIR / "cti-realm-scores.json"
AGENT_TS = REPO_ROOT / "src" / "lib" / "cti-realm" / "agent.ts"

# ----------------------------------------------------------------------------
# Pre-flight checks
# ----------------------------------------------------------------------------


def _resolve_node_bin() -> tuple[str, str]:
    """Find a working `node` and `npx` invocation.

    Resolution order, applied independently to each binary:
      1. Explicit override env var (`NODE_BIN` / `NPX_BIN`).
      2. `shutil.which(...)` against the current PATH.
      3. Well-known system locations as a last-resort hint
         (Homebrew on Apple Silicon + Intel, common Linux locations).
         No user home directories are hardcoded — those are not portable.

    If nothing resolves, raise `RuntimeError` with a message that lists what
    we tried, mentions the override env vars, and reminds the operator that
    Node 18+ is required for `tsx`.
    """
    # Well-known system paths — intentionally NO user home directories.
    # These are last-resort fallbacks for when PATH does not include the
    # standard package-manager bin directories (rare, but seen in cron-style
    # environments where PATH is just /usr/bin:/bin).
    node_fallbacks = [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
    ]
    npx_fallbacks = [
        "/usr/local/bin/npx",
        "/opt/homebrew/bin/npx",
        "/usr/bin/npx",
    ]

    def _resolve(label: str, env_var: str, fallbacks: list[str]) -> str:
        tried: list[str] = []

        env_override = os.environ.get(env_var, "").strip()
        if env_override:
            tried.append(f"${env_var}={env_override}")
            if Path(env_override).exists():
                return env_override

        which_hit = shutil.which(label)
        if which_hit:
            tried.append(f"shutil.which('{label}') -> {which_hit}")
            return which_hit
        tried.append(f"shutil.which('{label}') -> not found on PATH")

        for candidate in fallbacks:
            tried.append(candidate)
            if Path(candidate).exists():
                return candidate

        raise RuntimeError(
            f"could not locate `{label}` binary. Tried (in order): "
            + "; ".join(tried)
            + f". Override with the {env_var} environment variable, "
            "ensure the binary is on PATH, or install Node 18+ "
            "(required for `tsx`) via your platform's package manager."
        )

    node = _resolve("node", "NODE_BIN", node_fallbacks)
    npx = _resolve("npx", "NPX_BIN", npx_fallbacks)
    return node, npx


def _check_api_key() -> None:
    """Warn if ANTHROPIC_API_KEY is missing.

    The TS agent (src/lib/cti-realm/agent.ts) now uses claude-agent-sdk and
    runs against the operator's Claude Code subscription — no key required
    for the agent loop itself. inspect-ai's scorer, however, still calls the
    Anthropic API for the LLM-as-judge C4 (Detection Quality, 65% of score)
    checkpoint. With no key the scorer will produce N/A for C4 and we'll
    publish a partial honest score (max ~35% on C0-C3 only).

    We do NOT mock benchmark scores — see the ticket spec.
    """
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        sys.stderr.write(
            "[run-cti-realm] ANTHROPIC_API_KEY not set. The agent loop will "
            "use the Claude Code subscription via claude-agent-sdk. The "
            "scorer's C4 (Detection Quality) checkpoint requires an Anthropic "
            "key and will be marked N/A — published score will reflect "
            "C0-C3 only.\n"
        )
        return
    if not key.startswith("sk-"):
        sys.stderr.write(
            "ERROR: ANTHROPIC_API_KEY is set but does not look like a real "
            "Anthropic key (expected a value starting with 'sk-'). Either "
            "fix it or unset it to fall back to the subscription path.\n"
        )
        sys.exit(2)


# ----------------------------------------------------------------------------
# JSON-over-stdio bridge between Inspect AI tools and the TS agent
# ----------------------------------------------------------------------------


def _tool_to_anthropic_schema(t: Any) -> dict[str, Any]:
    """Convert an Inspect AI Tool object to the Anthropic tool-definition shape.

    Inspect tools are decorated callables with a `tool_def` attribute (or a
    similar metadata object) carrying name + description + parameters JSON
    schema. We dig through the typical surface, falling back to introspection.
    """
    # Try the modern Inspect AI surface first.
    tool_info = getattr(t, "tool_def", None) or getattr(t, "_tool_def", None)
    name = getattr(tool_info, "name", None) or getattr(t, "__name__", "tool")
    description = getattr(tool_info, "description", None) or (t.__doc__ or "").strip() or name
    params = getattr(tool_info, "parameters", None)
    if params is not None and hasattr(params, "model_dump"):
        schema = params.model_dump(exclude_none=True)
    elif isinstance(params, dict):
        schema = params
    else:
        schema = {"type": "object", "properties": {}, "required": []}
    if "type" not in schema:
        schema["type"] = "object"
    if "properties" not in schema:
        schema["properties"] = {}
    return {"name": name, "description": description, "input_schema": schema}


async def _drive_ts_agent(
    *,
    cti_report: str,
    tools: list[Any],
    model: str,
    max_iterations: int,
    npx_bin: str,
    extra_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Spawn the TS agent, send the init message, proxy tool calls.

    Returns the parsed `final` event payload (a CtiRealmAgentResult).
    """
    if not AGENT_TS.exists():
        raise FileNotFoundError(f"TS agent missing at {AGENT_TS}")

    # Build the per-tool dispatcher. Inspect tools are async callables; we run
    # them with the kwargs the model emits.
    dispatchers: dict[str, Any] = {}
    for t in tools:
        info = _tool_to_anthropic_schema(t)
        dispatchers[info["name"]] = t

    tool_defs = [_tool_to_anthropic_schema(t) for t in tools]

    cmd = [
        npx_bin,
        "tsx",
        str(AGENT_TS),
        "--report-from-stdin",
        "--tools-from-stdin",
    ]
    env = {**os.environ, **(extra_env or {})}

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(REPO_ROOT),
        env=env,
    )

    init_msg = {
        "type": "init",
        "ctiReport": cti_report,
        "tools": tool_defs,
        "model": model,
        "maxIterations": max_iterations,
    }
    assert proc.stdin is not None and proc.stdout is not None
    proc.stdin.write((json.dumps(init_msg) + "\n").encode("utf-8"))
    await proc.stdin.drain()

    final_event: dict[str, Any] | None = None
    error_event: dict[str, Any] | None = None

    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        try:
            event = json.loads(line.decode("utf-8").strip())
        except json.JSONDecodeError:
            sys.stderr.write(f"[ts-agent stdout, non-JSON]: {line!r}\n")
            continue

        etype = event.get("type")
        if etype == "tool_request":
            tname = event["name"]
            tinput = event.get("input") or {}
            disp = dispatchers.get(tname)
            try:
                if disp is None:
                    raise RuntimeError(f"unknown tool '{tname}' (not in registry)")
                result = await disp(**tinput) if asyncio.iscoroutinefunction(disp) else disp(**tinput)
                if asyncio.iscoroutine(result):
                    result = await result
                content = result if isinstance(result, str) else json.dumps(result, default=str)
                response = {"type": "tool_result", "id": event["id"], "content": content, "isError": False}
            except Exception as exc:  # noqa: BLE001
                response = {
                    "type": "tool_result",
                    "id": event["id"],
                    "content": f"tool error: {type(exc).__name__}: {exc}",
                    "isError": True,
                }
            proc.stdin.write((json.dumps(response) + "\n").encode("utf-8"))
            await proc.stdin.drain()
        elif etype == "final":
            final_event = event["result"]
        elif etype == "error":
            error_event = event
            break
        elif etype == "assistant_text":
            sys.stderr.write(f"[ts-agent text]: {event.get('text', '')[:200]}...\n")
        elif etype == "iteration":
            sys.stderr.write(f"[ts-agent iter {event.get('n')}]\n")
        elif etype == "model_swap":
            sys.stderr.write(f"[ts-agent model swap: {event}]\n")

    stderr_bytes = await proc.stderr.read()
    rc = await proc.wait()
    if error_event is not None:
        raise RuntimeError(f"TS agent reported error: {error_event.get('message')}\nstderr:\n{stderr_bytes.decode('utf-8', 'replace')}")
    if final_event is None:
        raise RuntimeError(
            f"TS agent exited (rc={rc}) without a final event.\nstderr:\n{stderr_bytes.decode('utf-8', 'replace')}"
        )
    return final_event


# ----------------------------------------------------------------------------
# Inspect AI integration
# ----------------------------------------------------------------------------


def _build_solver(npx_bin: str, model: str, max_iterations: int):
    """Construct the speedyturtle_cti_realm_solver as a closure over npx_bin."""
    from inspect_ai.solver import Generate, TaskState, solver

    @solver(name="speedyturtle_cti_realm_solver")
    def speedyturtle_cti_realm_solver(
        max_iters: int = max_iterations,
    ):
        async def solve(state: TaskState, generate: Generate) -> TaskState:
            # Inspect AI exposes the configured task tools on state.tools.
            tools = list(state.tools or [])
            if not tools:
                # If state.tools is empty (e.g. solver-override path), fall back
                # to the cti_realm minimal tool set.
                from inspect_ai.tool import bash, python
                from inspect_evals.cti_realm.core.tools import (
                    execute_kql_query,
                    get_table_schema,
                    list_kusto_tables,
                    sample_table_data,
                    validate_output_json,
                )

                tools = [
                    list_kusto_tables(),
                    get_table_schema(),
                    sample_table_data(),
                    execute_kql_query(),
                    validate_output_json(),
                    bash(timeout=180),
                    python(timeout=180),
                ]

            cti_report = state.input_text or str(state.input)

            try:
                final = await _drive_ts_agent(
                    cti_report=cti_report,
                    tools=tools,
                    model=model,
                    max_iterations=max_iters,
                    npx_bin=npx_bin,
                )
                # Push the agent's final answer onto the conversation as the
                # assistant's last message — the scorer reads ChatMessage history.
                from inspect_ai.model import ChatMessageAssistant

                state.messages.append(
                    ChatMessageAssistant(content=final.get("finalText", ""))
                )
                # Inspect AI scorers also read state.output.completion in many places.
                if hasattr(state, "output") and state.output is not None:
                    try:
                        state.output.completion = final.get("finalText", "")
                    except Exception:  # noqa: BLE001
                        pass
            except Exception as exc:  # noqa: BLE001
                from inspect_ai.model import ChatMessageAssistant

                err = f"speedyturtle agent failure: {type(exc).__name__}: {exc}"
                sys.stderr.write(err + "\n")
                state.messages.append(ChatMessageAssistant(content=err))
            return state

        return solve

    return speedyturtle_cti_realm_solver


def _build_smoke_task(npx_bin: str, model: str, max_iterations: int):
    """Produce a minimal Task for --smoke runs that doesn't depend on Docker."""
    from inspect_ai import Task, task
    from inspect_ai.dataset import Sample
    from inspect_ai.scorer import Score, Target, scorer
    from inspect_ai.solver import TaskState

    solver_factory = _build_solver(npx_bin, model, max_iterations)

    @scorer(metrics=[])
    def smoke_passthrough_scorer():
        async def score(state: TaskState, target: Target) -> Score:
            # Smoke runs never claim a benchmark score — we just verify the
            # agent emitted something.
            last = state.messages[-1].text if state.messages else ""
            return Score(
                value=1.0 if last.strip() else 0.0,
                answer=last,
                explanation="smoke pass-through; benchmark scoring is intentionally bypassed",
            )

        return score

    sample = Sample(
        input=(
            "DETECTION OBJECTIVE:\n"
            "This is a SMOKE TEST. Respond with a single JSON object containing the keys "
            '"sigma_rule" (string), "kql_query" (string), and "query_results" (array). '
            "Do not call any tools beyond what is strictly necessary; an empty body is acceptable."
        ),
        target="",
        id="smoke-1",
    )

    @task
    def cti_realm_smoke() -> Task:
        return Task(
            dataset=[sample],
            solver=solver_factory(),
            scorer=smoke_passthrough_scorer(),
            sandbox=None,
            message_limit=10,
        )

    return cti_realm_smoke


def _build_real_task(
    task_name: str,
    npx_bin: str,
    model: str,
    max_iterations: int,
    no_sandbox: bool = False,
):
    """Wrap one of the real cti_realm_* tasks, swapping in our solver."""
    from inspect_ai import Task, task as task_decorator
    import inspect_evals.cti_realm.cti_realm as ctimod

    base_factory = getattr(ctimod, task_name, None)
    if base_factory is None:
        raise ValueError(
            f"Unknown task '{task_name}'. Choose from: cti_realm_25, cti_realm_50, "
            f"cti_realm_25_minimal, cti_realm_25_seeded."
        )

    solver_factory = _build_solver(npx_bin, model, max_iterations)

    @task_decorator
    def speedyturtle_cti_realm_task() -> Task:
        base: Task = base_factory()
        # If --no-sandbox is set, drop the Docker sandbox spec entirely. This
        # degrades the eval (Kusto/MITRE service tools can't be reached over
        # docker network names like kusto-emulator:8080) but lets the harness
        # boot. Inspect's CLI --sandbox flag does NOT accept "none" — we have
        # to override at the Task level.
        sandbox = None if no_sandbox else base.sandbox
        return Task(
            dataset=base.dataset,
            solver=solver_factory(),
            scorer=base.scorer,
            sandbox=sandbox,
            message_limit=base.message_limit,
            version=getattr(base, "version", None),
            metadata=getattr(base, "metadata", None),
        )

    speedyturtle_cti_realm_task.__name__ = f"speedyturtle_{task_name}"
    return speedyturtle_cti_realm_task


# ----------------------------------------------------------------------------
# Score normalization
# ----------------------------------------------------------------------------


def _ingest_eval_log(eval_log_path: Path) -> dict[str, Any]:
    """Pull headline metrics out of an Inspect .eval log.

    The CTI-REALM scorer emits Score.value as a dict like:
        {"normalized_score": 0.42, "C0_cti_alignment": 1.0,
         "C1_threat_context": 0.5, "C2_data_exploration": 1.0,
         "C3_query_execution": 0.0, "C4_detection_quality": 0.3, ...}
    On failure paths, value is the literal string "FAILED" — those samples
    contribute nothing to the aggregates.

    Per-domain aggregation reads the sample id prefix (e.g. ``aks_001`` →
    ``aks``) since that's how the dataset is sliced.
    """
    from inspect_ai.log import read_eval_log

    log = read_eval_log(str(eval_log_path))
    samples_total = len(log.samples) if log.samples else 0
    per_checkpoint: dict[str, list[float]] = {cp: [] for cp in ("C0", "C1", "C2", "C3", "C4")}
    per_domain: dict[str, list[float]] = {}
    overall: list[float] = []
    samples_run = 0

    cp_keys = {
        "C0": "C0_cti_alignment",
        "C1": "C1_threat_context",
        "C2": "C2_data_exploration",
        "C3": "C3_query_execution",
        "C4": "C4_detection_quality",
    }

    for sample in log.samples or []:
        samples_run += 1
        scores = sample.scores or {}
        domain = None
        if isinstance(sample.id, str) and "_" in sample.id:
            domain = sample.id.split("_", 1)[0].lower()
        for _name, sc in scores.items():
            value = sc.value
            if isinstance(value, dict):
                norm = value.get("normalized_score")
                if isinstance(norm, (int, float)):
                    overall.append(float(norm))
                    if domain:
                        per_domain.setdefault(domain, []).append(float(norm))
                for cp_short, cp_long in cp_keys.items():
                    raw = value.get(cp_long)
                    if isinstance(raw, (int, float)):
                        per_checkpoint[cp_short].append(float(raw))

    def _mean(vals: list[float]) -> float:
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "score": _mean(overall),
        "per_checkpoint": {k: _mean(v) for k, v in per_checkpoint.items() if v},
        "per_domain": {k: _mean(v) for k, v in per_domain.items()},
        "samples_run": samples_run,
        "samples_total": samples_total,
    }


def _append_score_history(entry: dict[str, Any]) -> None:
    SCORES_FILE.parent.mkdir(parents=True, exist_ok=True)
    if SCORES_FILE.exists():
        try:
            current = json.loads(SCORES_FILE.read_text())
        except json.JSONDecodeError:
            current = {"history": []}
    else:
        current = {"history": []}
    current.setdefault("history", []).append(entry)
    SCORES_FILE.write_text(json.dumps(current, indent=2) + "\n")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Run CTI-REALM with the speedyturtle TS agent")
    parser.add_argument(
        "--task",
        default="cti_realm_25_minimal",
        choices=["cti_realm_25", "cti_realm_50", "cti_realm_25_minimal", "cti_realm_25_seeded"],
    )
    parser.add_argument("--limit", type=int, default=None, help="Max samples to run")
    parser.add_argument("--no-sandbox", action="store_true", help="Run without Docker (default: respect task spec)")
    parser.add_argument("--smoke", action="store_true", help="Smoke-test the plumbing (1 sample, no scoring)")
    parser.add_argument("--model", default="claude-opus-4-7", help="Model literal passed to the TS agent")
    parser.add_argument("--grader-model", default="claude-sonnet-4-6", help="Anthropic model used as the LLM-as-judge grader (C0 + C4). Default keeps the cost low while still using an Anthropic model so OAuth subscription auth applies.")
    parser.add_argument("--max-iterations", type=int, default=25)
    args = parser.parse_args()

    _check_api_key()
    _, npx_bin = _resolve_node_bin()
    INSPECT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Lazy import — inspect_ai pulls a lot of dependencies.
    from inspect_ai import eval as inspect_eval

    run_id = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")

    if args.smoke:
        task_factory = _build_smoke_task(npx_bin, args.model, args.max_iterations)
        task_name = "cti_realm_smoke"
    else:
        task_factory = _build_real_task(
            args.task,
            npx_bin,
            args.model,
            args.max_iterations,
            no_sandbox=args.no_sandbox,
        )
        task_name = args.task

    started = time.time()
    print(f"[{run_id}] running task={task_name} smoke={args.smoke} no-sandbox={args.no_sandbox}", flush=True)

    eval_kwargs: dict[str, Any] = {
        "tasks": task_factory(),
        "log_dir": str(INSPECT_LOG_DIR),
        "model": f"anthropic/{args.model}",  # placeholder — solver bypasses Inspect's model dispatch
        # Force the LLM-as-judge grader (C0 and C4) onto an Anthropic model
        # instead of the upstream default (openai/azure/gpt-5-mini). With
        # ANTHROPIC_AUTH_TOKEN set, the grader's API calls go through the
        # OAuth path and bill against the operator's Claude subscription
        # instead of requiring an Anthropic API key.
        "model_roles": {"grader": f"anthropic/{args.grader_model}"},
    }
    if args.limit is not None:
        eval_kwargs["limit"] = args.limit
    if args.no_sandbox:
        eval_kwargs["sandbox"] = None

    eval_succeeded = True
    eval_error: str | None = None
    try:
        results = inspect_eval(**eval_kwargs)
    except Exception as exc:
        eval_succeeded = False
        eval_error = f"{type(exc).__name__}: {exc}"
        sys.stderr.write(f"inspect eval failed: {eval_error}\n")
        results = []

    duration = time.time() - started
    print(f"[{run_id}] completed in {duration:.1f}s; {len(results)} log(s)", flush=True)

    # Locate the freshly-written .eval log for this run.
    candidates = sorted(INSPECT_LOG_DIR.glob("*.eval"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        sys.stderr.write("WARN: no .eval log produced — refusing to write a score row.\n")
        return 4

    latest = candidates[-1]
    target_log = INSPECT_LOG_DIR / f"{run_id}.eval"
    if latest != target_log:
        try:
            latest.rename(target_log)
        except OSError:
            target_log = latest

    if args.smoke:
        # Smoke runs do not produce a benchmark score. Print plumbing summary
        # to stdout for the operator and exit 0 if the agent completed.
        print(f"[smoke] log: {target_log}")
        if not eval_succeeded:
            print(f"[smoke] eval errored: {eval_error}", file=sys.stderr)
            return 5
        print("[smoke] plumbing OK — no score recorded (intentional)")
        return 0

    if not eval_succeeded:
        sys.stderr.write(
            "REFUSING to write a score row: inspect eval did not complete successfully. "
            "See stderr above for the underlying error. The .eval log was preserved at "
            f"{target_log} for debugging.\n"
        )
        return 6

    metrics = _ingest_eval_log(target_log)
    # Guard against silent zero-scoring runs caused by upstream scorer errors.
    # If every sample produced an empty score and there is no per-checkpoint
    # detail, treat the run as a failure rather than silently emit 0.0.
    if (
        metrics["samples_run"] == 0
        or (metrics["score"] == 0.0 and not metrics["per_checkpoint"] and not metrics["per_domain"])
    ):
        sys.stderr.write(
            "REFUSING to write a score row: scorer produced no usable metrics "
            "(this commonly happens when the agent could not call any tools or the "
            "scorer encountered a value-shape mismatch). The .eval log was preserved "
            f"at {target_log} for debugging.\n"
        )
        return 7

    entry = {
        "run_id": run_id,
        "task": task_name,
        "model": args.model,
        "score": metrics["score"],
        "per_checkpoint": metrics["per_checkpoint"],
        "per_domain": metrics["per_domain"],
        "samples_run": metrics["samples_run"],
        "samples_total": metrics["samples_total"],
        "inspect_log": str(target_log.relative_to(REPO_ROOT)),
    }
    _append_score_history(entry)
    print(json.dumps(entry, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
