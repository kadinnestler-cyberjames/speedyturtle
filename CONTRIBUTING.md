# Contributing to speedyturtle

Issues and PRs welcome. The bar for review is just: does it pass `npm run build` + `npx tsc --noEmit` + `npm run lint`, and is the change small enough to read in one sitting?

## Local setup

```bash
git clone https://github.com/kadinnestler-cyberjames/speedyturtle.git
cd speedyturtle
npm install

# Optional: install the scanner binaries for live scans
brew install nuclei httpx subfinder        # macOS
# OR: see https://github.com/projectdiscovery/{nuclei,httpx,subfinder} for Linux

npm run dev
```

To run the full scan pipeline you also need either:
- `ANTHROPIC_API_KEY` exported in your shell, or
- The Claude Code CLI logged in to a Claude Pro/Max subscription (the orchestrator falls back to `claude -p` automatically).

The benchmark harness needs Docker for sandboxed scoring — see `scripts/README-cti-realm.md`.

## What this project values

- **Honest output.** The `/benchmark/cti-realm` page refuses to display a score until a real run has produced one. Keep that bias — don't add fake numbers, lorem-ipsum chains, or marketing-flavored confidence.
- **Productized reasoning, not commodity scanning.** Findings without the validator / chain-reasoning / cheapest-cut / persona / genealogy passes are just nuclei output. The five-layer reasoning is the differentiator.
- **Self-host first, SaaS second.** The Vercel deploy is a marketing + demo + benchmark surface. Live scans are designed to run on your own machine where you control the toolchain and the LLM budget.

## Commit style

Short imperative subject (≤70 chars), then a body that explains the WHY. Reference issues when relevant. Co-authoring with Claude is fine — match the existing footer style.

## Reporting bugs

Open an issue with:
- The route or script you ran
- What you expected vs what happened
- A minimal way to reproduce

For security disclosures (vulnerabilities in speedyturtle itself), email `kadinnestler@uptalk.us` instead of opening a public issue.
