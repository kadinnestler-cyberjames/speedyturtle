# Security policy

## Supported versions

speedyturtle is on `main`-only. Security fixes land on `main` and ship to
the Vercel deploy via `vercel deploy --prod`. There are no maintenance
branches for older versions.

## Reporting a vulnerability

For vulnerabilities **in speedyturtle itself** (the orchestrator code, the
Next.js routes, the Vercel deploy, the GitHub Actions workflow, anything
that ships in this repo), email **kadinnestler@uptalk.us** with `[SECURITY]`
in the subject line. I will acknowledge within 72 hours.

Please do **not** open a public GitHub issue for security problems — it
defeats the point of coordinated disclosure on a security tool.

## What's in scope

- Auth bypass / privilege escalation in any speedyturtle route or API
- Server-side request forgery via the scanner pipeline (target validation
  bypass, internal-network scanning, etc.)
- Code execution via crafted scan inputs / prompt injection that escapes
  the orchestrator into the host
- Credential leaks (Claude OAuth tokens, Anthropic API keys, Stripe keys,
  Neon `DATABASE_URL`) being logged or echoed back to a visitor
- Prompt-injection-driven exfiltration (a scanned target that manipulates
  the agent into leaking secrets or running unauthorized tools)
- Supply-chain (npm or Python dependency that could compromise the build
  or runtime)

## Out of scope

- Findings the scanner produces about its own components are expected and
  do not need a separate report — that's just the scanner doing its job.
- Rate-limit / DoS reports against the public Vercel deploy are out of
  scope; rate limiting is intentional and tuned by Vercel platform.
- Self-XSS in your own browser (e.g. pasting JS into a form field).
- Issues that require physical access, social engineering of the
  maintainer, or compromise of personal accounts unrelated to the project.

## What you'll get from me

- Acknowledgement within 72 hours.
- A target fix date in the first reply, calibrated to severity.
- Public credit in the release notes if you want it (or anonymous if not).
- A `Co-Authored-By` trailer on the fix commit.

speedyturtle has no bug bounty program. If you're disclosing in good faith
I'll thank you publicly; if you're disclosing in bad faith expect this
project's own scanner output pointed at *your* infra.
