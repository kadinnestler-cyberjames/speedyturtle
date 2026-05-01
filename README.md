# speedyturtle

[![CI](https://github.com/kadinnestler-cyberjames/speedyturtle/actions/workflows/ci.yml/badge.svg)](https://github.com/kadinnestler-cyberjames/speedyturtle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/kadinnestler-cyberjames/speedyturtle)](LICENSE)
[![Stars](https://img.shields.io/github/stars/kadinnestler-cyberjames/speedyturtle?style=social)](https://github.com/kadinnestler-cyberjames/speedyturtle/stargazers)
[![Vercel](https://img.shields.io/badge/deploy-vercel-black?logo=vercel)](https://speedyturtle-khaki.vercel.app)

> Mythos-inspired offensive scanning + blue-team hardening, with a public CTI-REALM scoreboard. Built for businesses that don't have a $50K Snyk contract.

**Live:** https://speedyturtle-khaki.vercel.app

![Logo](public/logo.svg)

**The pitch:** Five world-first reasoning layers wired into a productized SaaS — validator subagent, exploit-chain reasoning, cheapest-cut heuristic, adversary-persona simulation, and vulnerability genealogy. Free tier on a credit card, no procurement cycle.

## Architecture

| Layer | Path | Role |
|---|---|---|
| Frontend | `src/app/` | Next.js 16 + React 19 + Tailwind v4 |
| Red-team scanner | `src/lib/scanners/` | `nuclei`, `httpx`, `subfinder` orchestration |
| Reasoning | `src/lib/orchestrator/` | validator, chain-reasoning, cheapest-cut, adversary-personas, genealogy |
| Blue team | `src/lib/blue-team/` | hardening loop, compliance tracker, monitoring |
| CTI-REALM agent | `src/lib/cti-realm/agent.ts` | ReAct solver wired to inspect_evals.cti_realm |
| Benchmark UI | `src/app/benchmark/cti-realm/` | public scoreboard vs Mythos |
| Test target | `test/juice-shop/` | OWASP Juice Shop dockerfile + scan harness |

## Reasoning layers (the why)

1. **Validator subagent** — adversarial false-positive filter. Per AISLE 2026 this scaffold pattern alone closes the largest gap between Mythos and other models.
2. **Exploit-chain reasoning** — Claude composes multi-step kill chains using Kettle, Orange Tsai, PPP, APT29 patterns. Mermaid storyboards render inline.
3. **Cheapest cut** — one mitigation that breaks the most chains. Inverts findings into actionable narrative.
4. **Adversary persona simulation** — APT29 / Lazarus / Sandworm / Scattered Spider / GenericRansomware exposure scoring with dwell-time estimates.
5. **Vulnerability genealogy** — trace each finding through history; predict the next mutation.

## CTI-REALM benchmark

Microsoft's end-to-end detection-rule generation benchmark. We run upstream `inspect_evals.cti_realm` with one substitution: our ReAct solver replaces the default `react()` solver. Tool registry stays upstream so the score is directly comparable to Mythos.

The public scoreboard at `/benchmark/cti-realm` will not fake a score. It shows `AWAITING_FIRST_RUN` until `data/cti-realm-scores.json` is populated by an actual run.

```bash
# 1. Venv (Python 3.12 required for inspect-ai)
uv venv --python python3.12 .venv-cti-realm
source .venv-cti-realm/bin/activate
uv pip install inspect-ai 'inspect-evals[cti_realm]' anthropic

# 2. Set Anthropic key in ~/.config/secrets.env (or env directly)
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Smoke test (no scoring, 1 synthetic sample)
./scripts/run-cti-realm.py --smoke

# 4. Real run (requires Docker for full score)
./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5
```

## Local dev

```bash
npm install
npm run dev
# http://localhost:3000
```

### Required environment

| Var | Where used | Required for |
|---|---|---|
| `ANTHROPIC_API_KEY` | reasoning layers + CTI-REALM agent | scans + benchmark |
| `DATABASE_URL` | `@neondatabase/serverless` | persisted scans |
| `STRIPE_SECRET_KEY` | checkout + webhook | paid tiers |
| `STRIPE_WEBHOOK_SECRET` | webhook handler | webhook signature verification |
| `CRON_SECRET` | `/api/benchmark/cti-realm/refresh` | Vercel cron auth in production |

See `STRIPE_SETUP.md` for the Stripe wiring.

## Test against OWASP Juice Shop

```bash
cd test/juice-shop && ./run.sh
```

Boots Juice Shop on `localhost:3001`, submits a Red Team scan to a running speedyturtle dev server, prints the result + PDF URLs. See `test/juice-shop/README.md`.

## Deploy

`vercel.json` defines two crons:
- `/api/blue-team/monitor/run` — daily 06:00 UTC (continuous monitoring sweep)
- `/api/benchmark/cti-realm/refresh` — daily 07:00 UTC (re-reads scoreboard JSON; future hook for a remote benchmark worker)

Deploy via `vercel deploy --prebuilt` after `next build`. The Tilacum stack pattern (build locally, deploy prebuilt) avoids Vercel build-time env-var headaches.

## Honest positioning

| | speedyturtle | Snyk / Wiz | Mythos (when GA) |
|---|---|---|---|
| Pricing | $99–$1,499/mo, credit card | $50K+ enterprise contract | TBD |
| Capability ceiling | Claude orchestration | commodity scanner + dashboards | frontier model |
| Procurement | none | months | unknown |

We're not Mythos. We orchestrate Claude into Mythos's use cases, on commodity infra, at SMB price points. When Mythos's GA pricing drops, the orchestrator can swap to it.

## License

MIT (TBD — confirm before public push).
