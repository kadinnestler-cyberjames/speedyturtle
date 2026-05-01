# Setup — what each env var unlocks

speedyturtle ships in three modes: **demo-only** (no setup), **self-host scans** (one key), and **publishable benchmark** (Docker + Anthropic key). This file is the master list of every env var, why it matters, where to set it, and what unlocks when you do.

## Demo-only — already works, no keys needed

The Vercel deploy at https://speedyturtle-khaki.vercel.app runs in this mode. Homepage, `/demo` (with Mermaid storyboards), `/benchmark/cti-realm` scoreboard, and `/pricing` all render. `/api/scan` returns a friendly 503 directing visitors to self-host.

## Self-host live scans — `ANTHROPIC_API_KEY` OR Claude Code login

Choose one path. Both unlock the full Red Team / Blue Team scan pipeline.

### Path A — Claude Code subscription (no API key)

```bash
# Install Claude Code if you haven't
brew install claude
claude /login   # OAuth flow against your Pro/Max subscription
```

That's it. The orchestrator detects the absence of `ANTHROPIC_API_KEY` and falls back to `claude -p` subprocess calls (proven by `scripts/test-llm-swap.ts`). Slower (~30s per LLM call due to cache warming) but billed against your subscription, no per-API-call charges.

### Path B — Anthropic API key

```bash
# In ~/.config/secrets.env or your shell
export ANTHROPIC_API_KEY=sk-ant-...
```

Faster (~1-2s per call), but you pay per scan (~$0.20 for a typical 6-stage orchestrator run).

### Plus: install the scanner toolchain

```bash
# macOS
brew install nuclei httpx subfinder
# Linux: see https://github.com/projectdiscovery
```

## Publishable CTI-REALM benchmark score — adds Docker + Python venv

The `/benchmark/cti-realm` page refuses to display a number until a real run produces one. To produce one:

```bash
# 1. Docker
brew install --cask docker && open -a Docker

# 2. Python 3.12 venv (already created if you've been following along)
uv venv --python python3.12 .venv-cti-realm
source .venv-cti-realm/bin/activate
uv pip install inspect-ai 'inspect-evals[cti_realm]' anthropic

# 3. Run
export ANTHROPIC_API_KEY=sk-ant-...        # required for the inspect-ai scorer
./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5
```

> **Heads up:** The `cti-realm/agent.ts` ReAct loop currently still uses the
> Anthropic SDK directly (the rest of the orchestrator runs subscription-only).
> Swapping it to `@anthropic-ai/claude-agent-sdk` is tracked as future work —
> the inspect-ai scorer also internally calls the Anthropic API for its
> LLM-as-judge step, so a fully no-API-key benchmark needs both swaps.

## Optional integrations

| Env var | Unlocks | Status |
|---|---|---|
| `DATABASE_URL` | Persisted scan history across restarts (Neon Postgres). Without it, scans live in-memory only. | Optional |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID_STARTER` / `_PRO` / `_UNLIMITED` + `STRIPE_WEBHOOK_SECRET` | Paid-tier checkout via `/pricing`. Without them, checkout returns 503. | Optional |
| `CRON_SECRET` | Authenticates Vercel cron triggers for `/api/blue-team/monitor/run` and `/api/benchmark/cti-realm/refresh`. Required in production. | Required for Vercel cron |
| `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` | Transactional email of scan reports to the visitor's email. Triage + risks + persona scores + report link + PDF link. Fire-and-forget; silently no-ops without keys. | **Wired.** Sign up at https://resend.com (100/day free), verify a domain you own at https://resend.com/domains, set `RESEND_FROM_ADDRESS="speedyturtle <reports@yourdomain.com>"`. Without a verified domain, sends only work to the Resend account email. |
| `SPEEDYTURTLE_WORKER_URL` | Proxy `/api/scan*` and `/scan/*` paths from the live Vercel deploy to a self-hosted worker (typically a Cloudflare Tunnel back to your Mac). Lets visitors run real scans without you running scanners on Vercel. | Optional. Skip if forks just want a marketing site. |
| `NEXT_PUBLIC_BASE_URL` | Override the origin used in checkout success/cancel URLs. Defaults to `https://speedyturtle-smb.vercel.app`. | Optional |
| `SPEEDYTURTLE_DEMO_MODE` | Force `/api/scan` to return 503 (auto-set on Vercel via `process.env.VERCEL`). | Auto-detected |

## Where to put them

- **Local dev:** `~/.config/secrets.env` and `source` it before `npm run dev`.
- **Vercel prod:** `vercel env add <NAME> production` (then redeploy).
- **CI:** `gh secret set <NAME>` for GitHub Actions secrets (CI itself doesn't need any LLM keys — it builds with `SPEEDYTURTLE_DEMO_MODE=1`).

## Quick decision table

| Goal | Minimum setup |
|---|---|
| Just look at the marketing site + /demo | nothing — visit https://speedyturtle-khaki.vercel.app |
| Self-host and run a real scan | Claude Code login OR `ANTHROPIC_API_KEY`, plus `brew install nuclei httpx subfinder` |
| Run the OWASP Juice Shop end-to-end demo | above + Docker (`brew install --cask docker`) |
| Publish a real CTI-REALM number on the scoreboard | above + Python 3.12 venv + `inspect-ai` + `inspect-evals[cti_realm]` |
| Activate paid tiers on the marketing site | Stripe keys in Vercel env |
| Persist scan history across deploys | Neon `DATABASE_URL` |
