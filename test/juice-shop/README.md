# OWASP Juice Shop test target

Built-in known-rich-vulnerability test target for demonstrating speedyturtle's full reasoning depth (validator + chain reasoning + cheapest cut + adversary persona + genealogy).

OWASP Juice Shop is intentionally vulnerable — designed to fail security scans. It surfaces dozens of real issues that the speedyturtle pipeline can compose into multi-step attack chains. Perfect demo target.

## Requirements

- Docker (Desktop or daemon)
- speedyturtle dev server running on `http://localhost:3030`
  ```
  cd ~/speedyturtle && PORT=3030 npm run dev
  ```

## Run a full scan

```bash
cd ~/speedyturtle/test/juice-shop && ./run.sh
```

This will:
1. `docker compose up -d` Juice Shop on `localhost:3001`
2. Wait for it to be healthy
3. Submit a Red Team scan to speedyturtle
4. Poll until complete (~5 min)
5. Print the result URL + PDF URL

## What you should see

Juice Shop typically surfaces:
- Multiple `info` / `low` exposures (`/.well-known/`, server fingerprints)
- `medium` misconfigurations (CSP weakness, cookie attributes, CORS)
- A few `high` template matches (REST API exposure, JWT issues)
- Strong material for Chain Reasoning (admin panel + API key leaks + auth bypass paths)

If `ANTHROPIC_API_KEY` is set, all 5 reasoning layers will produce rich output:
- Validator subagent will mark some findings as needs-review (Juice Shop has WAF-like defenses on some endpoints)
- Chain Reasoning will compose full account-takeover and admin-bypass chains
- Cheapest Cut will likely identify "set Secure+HttpOnly on cookies" as the highest-leverage fix
- Adversary Personas will score GenericRansomware + ScatteredSpider higher
- Genealogy will trace XSS / SQL injection / JWT issues back through historical CVE families

## Tear down

```bash
cd ~/speedyturtle/test/juice-shop && docker compose down
```

## Notes

- Scope: localhost:3001 is private — fully legal to scan, no auth concerns.
- Speed: scan takes ~5 min wall time; nuclei runs 5992 templates rate-limited.
- The Acunetix public test sites (testphp.vulnweb.com, testaspnet.vulnweb.com) are unreliable — testphp was down on 2026-05-01 testing. Juice Shop is the canonical reproducible alternative.
