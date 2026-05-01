# Ship checklist — Show HN, today

The 0.000-honest-baseline framing is now wired into the live site. Everything else is ready. Here's the exact sequence to launch.

## ⏰ Best window

**Tuesday 8:30am ET** is the historically strongest Show HN window for technical posts. If today is Tuesday, fire at 8:30. If today is Wednesday or Thursday, also fine — same window. Avoid Friday afternoon, weekends, US holidays.

## 🛫 Pre-flight (do these once, ~10 min total before posting)

- [ ] **Verify the live site loads cleanly:**
  - https://speedyturtle-khaki.vercel.app/ — homepage, mascot logo
  - https://speedyturtle-khaki.vercel.app/demo — three Mermaid storyboards rendered
  - https://speedyturtle-khaki.vercel.app/benchmark/cti-realm — 0.000 with the "Why is it 0.000?" callout visible right under the score
  - https://speedyturtle-khaki.vercel.app/pricing — mailto fallback (or real Stripe if you wired it)
- [ ] **Verify the GitHub repo loads:** https://github.com/kadinnestler-cyberjames/speedyturtle. CI badge green. README has badges + live-site link near the top.
- [ ] **Verify the demo screenshots are pinned somewhere reachable:** `~/Desktop/speedyturtle-LIVE.png`, `~/Desktop/speedyturtle-FIRST-SCORE.png`, `~/Desktop/speedyturtle-demo-page.png`. Sometimes commenters ask for screenshots — having them ready saves time.
- [ ] **Set yourself a 2-hour block:** clear calendar, close Slack notifications, plan to live-reply to first-wave commenters for ~90 min. Front-page residence time is determined in the first hour.

## 🚀 Post sequence

### 1. Show HN at 8:30am ET (Tuesday/Wednesday/Thursday)

Go to https://news.ycombinator.com/submit.

**Title:**
```
Show HN: Speedyturtle – Mythos-inspired security agent on a Claude subscription
```

**URL:**
```
https://github.com/kadinnestler-cyberjames/speedyturtle
```

**Text:** (paste verbatim — exactly fits HN's character limits)

```
speedyturtle is an open-source offensive scanning + blue-team hardening tool that orchestrates Claude (Opus 4.7) into Mythos's use cases. Five reasoning layers wrap nuclei/httpx/subfinder output:

1. Validator subagent — adversarial false-positive filter (per AISLE 2026, the scaffold pattern that closes most of the gap between Mythos and other models)
2. Exploit chain reasoning — composes multi-step kill chains using Kettle / Orange Tsai / PPP / APT29 patterns, emits Mermaid sequence diagrams
3. Cheapest cut — single mitigation that breaks the most chains
4. Adversary persona simulation — APT29 / Lazarus / Sandworm / Scattered Spider / GenericRansomware exposure scoring with dwell-time estimates
5. Vulnerability genealogy — traces each finding through historical CVE families and predicts the next mutation

The interesting bit: the entire pipeline runs on a Claude Pro/Max subscription with zero Anthropic API key. I wired @anthropic-ai/claude-agent-sdk for the agent loop, pulled the OAuth access token out of the macOS keychain entry that `claude /login` writes, exported it as ANTHROPIC_AUTH_TOKEN, and overrode inspect-ai's grader role from openai/azure/gpt-5-mini onto an Anthropic model so the LLM-as-judge call goes through the same OAuth path. Both the agent loop and the eval scorer bill against the operator's subscription.

Live: https://speedyturtle-khaki.vercel.app
Demo with Mermaid storyboards: https://speedyturtle-khaki.vercel.app/demo
First honest CTI-REALM run published: https://speedyturtle-khaki.vercel.app/benchmark/cti-realm — 0.000 baseline. The methodology page documents exactly what closes the gap to Mythos's 0.624-0.685 range. We chose to ship the honest number rather than wait for a curated one.

License: MIT. Self-host docs in SETUP.md. Looking for feedback on the OAuth substitution architecture and the five-layer reasoning prompt design.
```

### 2. Self-comment immediately (seeds the discussion)

Within 30 seconds of posting, hit "reply" on your own submission and post:

```
Author here. Happy to answer questions on:

(a) The OAuth substitution path that bypasses needing an Anthropic API key. The token comes out of the keychain entry `claude /login` writes; inspect-ai's anthropic provider already supports the `oauth-2025-04-20` beta header, so it just needed the token plumbing.

(b) The five reasoning layers and prompt design. The validator subagent is the one I think matters most — AISLE 2026 research suggests that scaffold pattern alone closes the largest gap between Mythos and other models on benchmark performance.

(c) Why I shipped the 0.000 first-run number instead of waiting. The page documents two known degradations: no-sandbox (Docker not available on this Mac) and grader rate-limiting on the OAuth path. Both have a written reproduction path. The honest baseline IS the moat.
```

### 3. Stay near the keyboard for ~90 min

Reply to comments quickly. **Don't argue.** Acknowledge skepticism, link to specific source files, thank people who try it.

Common comments + canned replies in `launch/show-hn.md`.

### 4. Post r/netsec ~2 hours after Show HN

Different framing — security audience, focus on the five reasoning layers. Full draft in `launch/r-netsec.md`.

### 5. Post LinkedIn the next day

Builder story. Image attached (`speedyturtle-FIRST-SCORE.png`). Full draft in `launch/linkedin.md`.

## 🛑 Don't ship if any of these are true

- The live site is currently 500ing (check before posting)
- You can't be available for 90 min after posting
- It's a Friday afternoon or holiday
- Hacker News is currently down (check https://news.ycombinator.com/)

## 📊 What success looks like

| Metric | "Quiet" | "Solid" | "Front page" |
|---|---|---|---|
| HN points after 1h | 5–10 | 25–60 | 80+ |
| GitHub stars after 24h | 5–20 | 100–300 | 500+ |
| Vercel page views, 24h | 50 | 500 | 5000+ |

Anything in the "Solid" column is a **win**. Front page is a coin flip on any given Tuesday — don't optimize for it, just post good work.

## 🔁 The day after

Whatever lands, run the scheduled remote agent (`trig_01DgoKbsmSjTVBNrEK1pEvkA`) early to capture traffic data while it's still fresh. The agent will either open a polish PR or post an Issue with a recommendation depending on what it sees.
