# Show HN: speedyturtle — Mythos-inspired security agent on a Claude subscription, no API key

**Title (80 char limit):**
> Show HN: speedyturtle – Mythos-inspired security agent, runs on Claude subscription

**URL:**
https://github.com/kadinnestler-cyberjames/speedyturtle

**Submission text** (Hacker News allows ~2000 chars, keep it ~1200):

---

speedyturtle is an open-source offensive scanning + blue-team hardening tool that orchestrates Claude (Opus 4.7) into Mythos's use cases. Five reasoning layers wrap nuclei/httpx/subfinder output:

1. **Validator subagent** — adversarial false-positive filter (per AISLE 2026, the scaffold pattern that closes most of the gap between Mythos and other models)
2. **Exploit chain reasoning** — composes multi-step kill chains using Kettle / Orange Tsai / PPP / APT29 patterns, emits Mermaid sequence diagrams
3. **Cheapest cut** — single mitigation that breaks the most chains
4. **Adversary persona simulation** — APT29 / Lazarus / Sandworm / Scattered Spider / GenericRansomware exposure scoring with dwell-time estimates
5. **Vulnerability genealogy** — traces each finding through historical CVE families and predicts the next mutation

The interesting bit for HN: **the entire pipeline runs on a Claude Pro/Max subscription with zero Anthropic API key.** I wired `@anthropic-ai/claude-agent-sdk` for the agent loop, pulled the OAuth access token out of the macOS keychain entry that `claude /login` writes, exported it as `ANTHROPIC_AUTH_TOKEN`, and overrode inspect-ai's grader role from the upstream `openai/azure/gpt-5-mini` default onto an Anthropic model so the LLM-as-judge call goes through the same OAuth path. Both the agent loop AND the eval scorer now bill against the operator's subscription.

Live site (marketing + sample report + benchmark scoreboard): https://speedyturtle-khaki.vercel.app
Sample report with three Mermaid storyboards: https://speedyturtle-khaki.vercel.app/demo
First honest CTI-REALM run published: https://speedyturtle-khaki.vercel.app/benchmark/cti-realm (0.000 baseline, no-sandbox + grader rate-limited; the methodology page shows the full degradation set)

Pricing: $99/mo Starter, $499/mo Pro, $1,499 flat Unlimited — sold to SMBs that don't have a $50K Snyk budget. Free tier on a credit card, no procurement cycle.

License: MIT. Self-host docs in SETUP.md. Looking for feedback on the OAuth-substitution architecture and the five-layer reasoning prompt design.

---

**Best posting time:** Tuesday or Wednesday, 8:30-9:30am ET. Avoid Mondays, Fridays, and holidays. Stay near keyboard for first 90 min to reply to first-wave comments.

**First-comment template** (post immediately yourself to seed):
> Author here. Happy to answer questions on (a) the OAuth substitution path that bypasses needing an Anthropic API key, (b) the five reasoning layers and prompt design, (c) why I shipped the 0.000 first-run number instead of waiting for a fair Mythos comparison. The honest baseline is part of the project's stated bias.

**Comments to expect + canned answers:**
- *"Why not just use Snyk/Wiz?"* — Snyk is $50K+ enterprise contracts. We sell at $99/mo on a credit card to SMBs that get told "your business is too small for us."
- *"Is the OAuth thing against Anthropic ToS?"* — `claude setup-token` is an officially-supported command for creating long-lived auth tokens; inspect-ai already supports the `oauth-2025-04-20` beta header.
- *"Score is 0.000?"* — Yes, intentionally honest. Two known degradations on the methodology page; both close with Docker installed + paid grader access.
- *"Why CTI-REALM specifically?"* — Microsoft's only public, reproducible end-to-end detection-rule benchmark. Direct way to compare against Mythos.
