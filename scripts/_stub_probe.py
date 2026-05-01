"""Stub-solver harness probe for T-002 acceptance.

Verifies that an Inspect AI Task / solver / scorer pipeline can boot, evaluate
one sample, and write a .eval log to disk WITHOUT hitting Anthropic. This
proves the harness wiring is correct so that, once the API key is provided,
only the agent side needs to be exercised.
"""
from __future__ import annotations

import os
import sys

# Inspect AI insists on an Anthropic key being present even when the solver
# bypasses model dispatch. We set a sentinel value; the stub solver never
# touches it.
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-stub-not-used-by-stub-solver")

from inspect_ai import Task, eval as inspect_eval
from inspect_ai.dataset import Sample
from inspect_ai.solver import Generate, TaskState, solver
from inspect_ai.scorer import Score, scorer
from inspect_ai.model import ChatMessageAssistant


@solver
def stub_solver():
    async def solve(state: TaskState, generate: Generate) -> TaskState:
        state.messages.append(
            ChatMessageAssistant(
                content='{"sigma_rule":"","kql_query":"","query_results":[]}'
            )
        )
        return state

    return solve


@scorer(metrics=[])
def stub_scorer():
    async def score(state, target):
        return Score(value=0.0, answer="stub", explanation="harness probe")

    return score


task = Task(
    dataset=[Sample(input="probe", target="", id="probe-1")],
    solver=stub_solver(),
    scorer=stub_scorer(),
    sandbox=None,
)

results = inspect_eval(
    tasks=task,
    log_dir="data/inspect-logs",
    model="anthropic/claude-opus-4-5",
)
print(f"STUB OK; logs={len(results)}")
sys.exit(0)
