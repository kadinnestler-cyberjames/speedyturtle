# Stripe Setup — speedyturtle paid tiers

Operator runbook for wiring Stripe into the production deploy at
`https://speedyturtle-smb.vercel.app`.

> **Production-mode warning.** This deploy is the public production site. Use
> **live** Stripe keys (`sk_live_…`, `whsec_…`). Do **NOT** paste a test-mode
> key (`sk_test_…`) into Vercel — it will silently take real customer email
> addresses through a sandbox checkout that never actually charges them.
> If you want to dry-run, do it locally with a separate `.env.local`.

---

## 0. Prerequisites

- Stripe CLI installed and logged in to your live account: `stripe login`
- Vercel CLI logged in: `vercel login`
- The Vercel project is already linked from `~/speedyturtle/`. Confirm with `vercel link --yes` if needed.

## 1. Create products + prices in Stripe (live mode)

Run each `stripe products create` and capture the returned product id, then
`stripe prices create` against that product id and capture the price id.

```bash
# Starter — $99/mo
stripe products create \
  --name "speedyturtle Starter" \
  --description "10 Red Team scans per month, Blue Team hardening plan, PDF reports."

# Capture the printed product id (e.g. prod_ABC123) and use it below:
stripe prices create \
  --product prod_REPLACE_WITH_STARTER_PRODUCT_ID \
  --currency usd \
  --unit-amount 9900 \
  --recurring "interval=month"
# Capture the printed price id (e.g. price_1PStarterXYZ).

# Pro — $499/mo
stripe products create \
  --name "speedyturtle Pro" \
  --description "Unlimited scans, exploit chain reasoning, adversary persona simulation, vuln genealogy."

stripe prices create \
  --product prod_REPLACE_WITH_PRO_PRODUCT_ID \
  --currency usd \
  --unit-amount 49900 \
  --recurring "interval=month"

# Unlimited — $1,499/mo flat
stripe products create \
  --name "speedyturtle Unlimited" \
  --description "Everything in Pro, no per-domain cap, continuous monitoring posture."

stripe prices create \
  --product prod_REPLACE_WITH_UNLIMITED_PRODUCT_ID \
  --currency usd \
  --unit-amount 149900 \
  --recurring "interval=month"
```

After all three runs you should have three `price_…` ids. Save them somewhere
safe — `~/.config/secrets.env` is fine — keyed as
`STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_UNLIMITED`.

## 2. Set Vercel environment variables (production)

Run these from `~/speedyturtle/`. Each `vercel env add` prompts you to paste
the value, then asks which environment(s) — choose **Production** for all.

```bash
# Stripe live secret key (starts with sk_live_)
vercel env add STRIPE_SECRET_KEY production

# Webhook signing secret (set this AFTER step 3 — circle back)
vercel env add STRIPE_WEBHOOK_SECRET production

# Live price ids from step 1
vercel env add STRIPE_PRICE_ID_STARTER production
vercel env add STRIPE_PRICE_ID_PRO production
vercel env add STRIPE_PRICE_ID_UNLIMITED production

# Optional — overrides the request-derived origin used in checkout success/cancel URLs.
# Leave unset to default to https://speedyturtle-smb.vercel.app.
vercel env add NEXT_PUBLIC_BASE_URL production
```

Verify the set:

```bash
vercel env ls production
```

You should see `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_UNLIMITED`
(and optionally `NEXT_PUBLIC_BASE_URL`).

## 3. Register the webhook endpoint in Stripe

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint** (in **live** mode).
2. **Endpoint URL:**

   ```
   https://speedyturtle-smb.vercel.app/api/webhook/stripe
   ```

3. **Events to subscribe to:**
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint**.
5. After it's created, click into the endpoint and reveal the **Signing
   secret** (`whsec_…`). Copy it.
6. Re-run `vercel env add STRIPE_WEBHOOK_SECRET production` and paste that
   value (or remove + re-add if already set).

## 4. Redeploy production to pick up the env vars

Vercel needs a redeploy after env var changes for them to take effect at
runtime.

```bash
cd ~/speedyturtle
vercel --yes --prod
```

## 5. Smoke test

```bash
# Pricing page should still 200
curl -sI https://speedyturtle-smb.vercel.app/pricing

# Checkout should now return a Stripe URL instead of 503
curl -s -X POST https://speedyturtle-smb.vercel.app/api/checkout/starter \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' | head -c 400
```

The checkout response should include a `"url":"https://checkout.stripe.com/c/pay/..."`.

In a browser:

1. Visit `https://speedyturtle-smb.vercel.app/pricing`.
2. Click **Get Starter →**, drop in your email, submit.
3. You should be redirected to `checkout.stripe.com`.
4. Pay with a live card (or just close the tab — `cancel` redirects back to
   `/pricing?status=cancelled`).
5. After a successful payment, the webhook should fire. Tail the Vercel logs:
   ```bash
   vercel logs https://speedyturtle-smb.vercel.app --follow
   ```
   You should see `upserted subscription for ... tier=starter`.

## 6. Verify quota enforcement

After a successful subscription, a free-tier user calling
`POST /api/scan` after their first scan should receive HTTP 402 with:

```json
{
  "error": "You've used your free scan this month (1/1). Upgrade for more.",
  "tier": "free",
  "scansThisMonth": 1,
  "scanCap": 1,
  "upgrade": "/pricing"
}
```

A starter subscriber will hit the same 402 after 10 scans. Pro and Unlimited
subscribers are uncapped.

## 7. Cancellation path

- A user can cancel their subscription from the Stripe Customer Portal.
- When the Stripe subscription period ends, Stripe sends
  `customer.subscription.deleted`. Our webhook calls `markInactive(...)`,
  which sets `status: "inactive"` and drops them back to `tier: "free"`.

---

## Troubleshooting

- **`/api/checkout/starter` returns 503 with "Billing not configured"** —
  one of `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_STARTER` is missing in the
  production environment. Re-check `vercel env ls production`.
- **Webhook returns 400 "Webhook signature verification failed"** — the
  `STRIPE_WEBHOOK_SECRET` does not match the secret on the live endpoint
  in the Stripe Dashboard. Re-pull the signing secret and re-set the env var.
- **Webhook returns 503** — `STRIPE_WEBHOOK_SECRET` is unset.
- **Subscription not upgrading the user** — check the Vercel function logs
  for the webhook route. The most common cause is the webhook firing without
  the `tier` in `metadata`. The checkout route always sets it; if you're
  testing via `stripe trigger`, pass `--add metadata.tier=starter`.

## Data model

User billing state lives at `${SPEEDYTURTLE_STORE_DIR}/billing/users.json`,
keyed by lowercased email. Each record:

```ts
{
  email: string;             // lowercased
  tier: "free" | "starter" | "pro" | "unlimited";
  status: "active" | "inactive";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  monthlyScans: { "YYYY-MM": number };
  updatedAt: string;
}
```

On Vercel, `SPEEDYTURTLE_STORE_DIR` defaults to `/tmp/speedyturtle`. That's
ephemeral per-instance — fine for the v1 quota gate but **not** durable. The
follow-up ticket is to back this with Neon (already a project dep) or Vercel
KV. Webhook-driven `tier` upgrades will survive an instance recycle as long
as Stripe re-fires `checkout.session.completed` on retry; the per-month
counter does not.
