# Cold-outreach email template

**Use case:** scan 50 SMBs in one vertical (Tilacum's ICP: Stoughton MA restaurants, or whichever you target this month). For each, run speedyturtle, then send a personalized email leading with specific findings.

**Subject lines** (A/B test):
- *We found 3 issues on [Restaurant].com — free 1-page report inside*
- *[Restaurant], your booking page has an unpatched CVE-2021-41773 — quick note*
- *Saw your site is running Apache 2.4.49 — there's a public exploit*

The CVE-specific subject line will outperform if the finding is real. Don't send it if the finding isn't real.

---

**Body template** (2026-04-22; replace `[BRACKETS]` with scan output):

Hi [OWNER_FIRST_NAME],

I run [speedyturtle](https://speedyturtle-khaki.vercel.app), an SMB security platform. We scanned [BUSINESS_NAME].com last week as part of a free check we run for restaurants in [REGION] — three findings worth flagging:

1. **[FINDING_1_TITLE]** on [ASSET]. [WHY_IT_MATTERS_PLAIN_ENGLISH]. Severity: [SEV] (CVSS [SCORE], CVE-[YEAR]-[NNNN]).
2. **[FINDING_2_TITLE]** on [ASSET]. [WHY_IT_MATTERS_PLAIN_ENGLISH].
3. **[FINDING_3_TITLE]** on [ASSET]. [WHY_IT_MATTERS_PLAIN_ENGLISH].

The most concerning one is #1 — [SPECIFIC_ATTACKER_SCENARIO_FROM_CHAIN_REASONING_OUTPUT, e.g. "an attacker can read /etc/passwd via the path-traversal flaw in Apache, which means your reservation database credentials are accessible from any internet host"].

The good news: there's one specific fix that closes most of this. [CHEAPEST_CUT_FROM_SCAN_OUTPUT, e.g. "upgrade Apache to 2.4.51 — your hosting provider can do this in 30 min"].

If you'd like the full PDF report (with the rest of the scan and a rough remediation plan), reply with "send report" and I'll fire it over today. No pitch, no follow-up sequence — just a one-page report.

If you want speedyturtle to keep monitoring monthly and email you when new exposures appear, that's $99/mo: [https://speedyturtle-khaki.vercel.app/pricing]. No procurement cycle, credit card, cancel anytime.

Either way, glad to help.

— Kadin
[CONTACT_INFO]

---

**Ground rules so this doesn't backfire:**

1. **Only scan targets you'd legally be allowed to scan.** speedyturtle's red-team mode requires `authorizationConfirmed: true` for a reason. For cold outreach, stick to passive recon (subdomain enumeration + httpx fingerprinting) — those are not legally distinguishable from someone visiting the site. Don't run nuclei against targets you don't own. The cold email leads with PASSIVELY-DERIVED findings (visible HTTP headers, public CVE patterns based on detected versions) rather than actively-exploited findings.
2. **Don't send if all findings are info-level.** Manufacturing urgency from `Server: nginx/1.18.0` headers reads as desperate. Send only when there's a real medium+ finding that gives you specific, defensible footing.
3. **One round, no follow-up sequences.** If they don't respond to a personalized email with three real findings, more emails won't help and damage your sender reputation.
4. **Track in Airtable.** The Airtable MCP is already wired in your stack. One row per send: target, subject line, findings included, response received (yes/no/spam-flagged), conversion (free report sent / paid signup). After 50 sends, you have data to tighten the next batch.

---

**Conversion rate baseline to expect:**

- Open rate (CVE-specific subject): 35-45% on cold to SMB
- Reply rate (asking for report): 5-12%
- Free-report-sent → paid signup: 5-15%
- So 50 emails → roughly 1-3 paying customers ($99-$1500 MRR per batch)

That's a real economic case for spending an afternoon on this once a week.
