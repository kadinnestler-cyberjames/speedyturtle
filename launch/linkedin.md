# LinkedIn post

**Format:** Personal builder-story angle. LinkedIn rewards "I shipped a thing in a weekend" + technical screenshot + clear call to action. Aim for 1300-1500 chars (LinkedIn shows ~210 chars before "see more"; lead with hook).

---

I built and shipped a Mythos-inspired open-source security platform on a Claude Max subscription this weekend — no Anthropic API key, no $50K Snyk contract, no procurement cycle. Live now: speedyturtle-khaki.vercel.app

The architecture: nuclei/httpx/subfinder findings get wrapped in five reasoning layers driven by Claude Opus 4.7 — validator subagent (adversarial false-positive filter), exploit chain reasoning (composes multi-step kill chains using Kettle / Orange Tsai / PPP / APT29 patterns with Mermaid sequence diagrams), cheapest-cut analysis (one mitigation that breaks the most chains), adversary persona simulation (APT29 / Lazarus / Sandworm / Scattered Spider / GenericRansomware exposure scoring with dwell-time estimates), and vulnerability genealogy (traces each finding through historical CVE families).

The interesting technical bit: the entire pipeline including the inspect-ai CTI-REALM benchmark grader runs on a Claude subscription via the OAuth beta header, not an API key. Pulled the token out of the macOS keychain that `claude /login` writes. Zero per-call billing.

This is the SMB security tool I wanted to exist. Snyk and Wiz sell at $50K+ to enterprises — anyone smaller gets told "you're too small for us." speedyturtle ships at $99/mo on a credit card. Free tier, MIT license, deploy on your own infra.

If you run a small business website, I'd love to scan it for you free as a sanity check on the tool — DM me. If you're an engineer interested in the OAuth substitution architecture or the five-layer reasoning prompt design, the source is at github.com/kadinnestler-cyberjames/speedyturtle and the benchmark methodology page walks through the prompt structure.

Built with Claude Code + the new claude-agent-sdk, deployed to Vercel, written up while I was building it.

#opensource #cybersecurity #ai #claude #ssmb

---

**Best time:** Tuesday or Wednesday morning ET. LinkedIn Pulse algorithm rewards posts that get strong engagement in the first 60 min, so be available to reply.

**Image to attach:** the `~/Desktop/speedyturtle-FIRST-SCORE.png` screenshot showing the live benchmark scoreboard. People scroll past text-only posts; an image with a 0.000-vs-Mythos-0.624-0.685 comparison table will stop the scroll.

**Tag list:** Garry Tan (if you have his attention), any security researchers in your network, Anthropic / Claude Code official accounts.
