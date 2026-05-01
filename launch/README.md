# Launch kit

Drafts of distribution posts written ahead of the publishable CTI-REALM benchmark
score. Don't ship any of these until the benchmark on the live site shows a
non-zero number — the 0.000 honest baseline is good positioning for the methodology
section but undercuts the "look at our score" framing of the launch posts.

| File | Channel | Audience | When to ship |
|---|---|---|---|
| `show-hn.md` | Hacker News | Builders + technical | Tuesday or Wednesday 8:30-9:30am ET, after a real score lands |
| `r-netsec.md` | r/netsec | Security practitioners | Same day as Show HN, ~2h later, different angle |
| `linkedin.md` | LinkedIn | Personal network + SMB owners | Same week, different day to spread reach |
| `cold-email-template.md` | 1:1 outreach | Targeted SMBs (Tilacum ICP) | Ongoing weekly batches of 50 |

## Sequencing

The right week looks like:

1. **Day 0**: install Docker, run the real CTI-REALM benchmark with sandbox + paid grader (or wait through OAuth rate limits), commit the score.
2. **Day 1 (Tue 8:30am ET)**: post Show HN. Reply to comments live for the next 90 min. Pin the GitHub repo to your profile.
3. **Day 1 (Tue 10:30am ET)**: post r/netsec. Different framing — focus on the five reasoning layers + Mythos comparison rather than the OAuth bit (which is the HN headline).
4. **Day 2 (Wed 9:00am ET)**: post LinkedIn. Personal builder story angle, attach the screenshot.
5. **Day 3-7**: scan first batch of 50 cold-outreach targets, send emails Tuesday following week morning.
6. **Day 14**: the scheduled remote agent (`trig_01DgoKbsmSjTVBNrEK1pEvkA`) checks traction and either opens a polish PR or files a brief Issue.

## Don't ship until

- [ ] CTI-REALM scoreboard shows a real non-zero number
- [ ] The OWASP Juice Shop end-to-end demo has been recorded as a video / GIF and added to the README
- [ ] At least one fully-self-hosted scan run has been completed by *someone other than you* (can be a friend) — ensures the SETUP.md actually works
- [ ] LICENSE is finalized (currently MIT)
- [ ] Stripe is either fully wired or hidden (currently the /pricing buttons will 503 — that's bad for HN traffic)

## Things to NOT do

- Don't crosspost simultaneously. HN flags simultaneous posts as marketing.
- Don't claim "Mythos-killer" or any benchmark dominance language. The honest 0.000 is the moat — own the partial-score framing.
- Don't link to your other Omega projects from the launch posts. Keep speedyturtle as a clean standalone story; cross-promotion looks like ad-blast.
