# r/netsec post

**Title:**
> Mythos-inspired open-source security agent: validator subagent + exploit chain reasoning + cheapest-cut, runs on a Claude subscription

**Body:**

---

I built [speedyturtle](https://github.com/kadinnestler-cyberjames/speedyturtle) over the last week — an offensive scanner + blue-team hardening platform that wraps nuclei/httpx/subfinder findings in five Claude-driven reasoning layers. Sharing here because the architecture has some bits I think this sub will care about.

**Five reasoning layers, in order:**

1. **Validator subagent** — every non-info finding goes to an adversarial subagent in a fresh context with no triage / chain / build context. Its only job is to disprove the finding. Returns `validated` / `false-positive` / `needs-review` per finding. AISLE 2026 research suggests this scaffold pattern alone closes the largest gap between Mythos and other models on benchmark performance — most cybersecurity LLM "wins" come from *systems* not *raw model capability*.

2. **Exploit chain reasoning** — Opus 4.7 takes the validated findings and composes multi-step kill chains using documented attacker patterns:
   - Kettle/Orange Tsai (parser disagreement → SSRF/auth bypass)
   - PPP CTF (info leak + memcorrupt + control flow)
   - Halvar Flake (patch gap + reachable codepath)
   - APT29 cloud-native (identity hop via OAuth)
   - Scattered Spider (help-desk URL + employee directory + MFA reset path)
   
   Each chain emits a Mermaid sequence diagram. Output [here](https://speedyturtle-khaki.vercel.app/demo) — three real chains rendered.

3. **Cheapest cut** — across all chains, find the single mitigation that breaks the most. Inverts the findings list into one actionable narrative instead of a 60-row CVE table.

4. **Adversary persona simulation** — scores the target against APT29, Lazarus, Sandworm, Scattered Spider, and GenericRansomware. Returns exposure score 0-100, conditions met / missing, likely entry point, expected dwell time. Useful for prioritizing hardening based on actual threat model rather than CVSS.

5. **Vulnerability genealogy** — groups findings by bug pattern (not by individual CVE), traces 3-5 historical CVEs in the same family showing how the pattern mutated to bypass each round of fixes, predicts the next mutation. e.g. *"Path normalization confusion → directory traversal: 2014 Shellshock → 2017 nginx → 2021 Apache 2.4.49 → 2024 SQLi-via-encoded-slash"*. Predicts what an attacker would try next given current defenses.

**Honest positioning:** I'm not Mythos. This orchestrates Claude into Mythos's use cases. It's $99/mo on a credit card, no procurement cycle, deployable on your own infra in 5 minutes. Frontier-model raw capability I can't match — but the orchestrator architecture lets me swap to Mythos when its pricing drops.

**CTI-REALM benchmark:** I published the first honest run (0.000 baseline, no-sandbox + OAuth grader rate-limited) at [/benchmark/cti-realm](https://speedyturtle-khaki.vercel.app/benchmark/cti-realm). Full methodology + reproduction steps on the page. No fake scores.

**Subscription-only LLM path:** because everyone in this sub will ask — yes, the entire pipeline including the inspect-ai eval grader runs on a Claude Pro/Max subscription via the `oauth-2025-04-20` beta. Token comes out of the keychain entry `claude /login` writes. Zero API key, zero per-call billing. Wrapper script in `scripts/with-claude-oauth.sh`.

**OWASP Juice Shop test target included** — `cd test/juice-shop && ./run.sh` boots Juice Shop locally and submits a Red Team scan; you get a real PDF report with chains and persona scores in 5-10 minutes.

MIT license, no telemetry. PRs welcome. Particularly want feedback on the chain-reasoning prompt design and whether the genealogy lineages line up with what experienced researchers would write.

GitHub: https://github.com/kadinnestler-cyberjames/speedyturtle
Live: https://speedyturtle-khaki.vercel.app
