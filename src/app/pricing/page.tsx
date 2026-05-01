import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Logo } from "@/components/Logo";

type PaidTier = "starter" | "pro" | "unlimited";

type TierCard = {
  id: "free" | PaidTier;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  accent: "slate" | "emerald" | "sky" | "amber";
  cta:
    | { kind: "link"; href: string; label: string }
    | { kind: "checkout"; tier: PaidTier; label: string };
};

const TIERS: TierCard[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "/ month",
    blurb: "Kick the tires on a domain you own.",
    features: [
      "1 Red Team scan / month",
      "Validator-filtered findings",
      "Plain-English Claude triage",
      "Email delivery of report",
    ],
    accent: "slate",
    cta: { kind: "link", href: "/red-team", label: "Start scanning →" },
  },
  {
    id: "starter",
    name: "Starter",
    price: "$99",
    cadence: "/ month",
    blurb: "For owners running a real business that needs ongoing coverage.",
    features: [
      "10 Red Team scans / month",
      "Blue Team hardening plan",
      "Compliance coverage view",
      "PDF reports",
      "Email support",
    ],
    accent: "emerald",
    cta: { kind: "checkout", tier: "starter", label: "Get Starter →" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "$499",
    cadence: "/ month",
    blurb: "For agencies and IT teams managing multiple targets.",
    features: [
      "Unlimited Red Team scans",
      "Adversary persona simulation (APT29 / Lazarus / Sandworm / Scattered Spider)",
      "Exploit chain reasoning + cheapest cut",
      "Vulnerability genealogy",
      "Priority email support",
    ],
    accent: "sky",
    cta: { kind: "checkout", tier: "pro", label: "Get Pro →" },
  },
  {
    id: "unlimited",
    name: "Unlimited",
    price: "$1,499",
    cadence: "/ month flat",
    blurb: "For shops that scan continuously across many domains.",
    features: [
      "Everything in Pro",
      "No per-domain cap",
      "Continuous monitoring posture",
      "Slack-native alerts (coming soon)",
      "Direct line to engineering",
    ],
    accent: "amber",
    cta: { kind: "checkout", tier: "unlimited", label: "Get Unlimited →" },
  },
];

const ACCENT_RING: Record<TierCard["accent"], string> = {
  slate: "border-slate-800",
  emerald: "border-emerald-500/40",
  sky: "border-sky-500/40",
  amber: "border-amber-500/40",
};

const ACCENT_TEXT: Record<TierCard["accent"], string> = {
  slate: "text-slate-300",
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  amber: "text-amber-400",
};

export default function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  // Hide the Stripe checkout buttons unless the production server has
  // STRIPE_SECRET_KEY wired. Without it, the /api/checkout/[tier] route
  // returns 503 and clicking the button gives the visitor a confusing
  // error mid-flow. Until you provision Stripe keys, the page falls back
  // to a "Email me to enroll" mailto link that converts intent into a
  // qualified inbound rather than a broken checkout.
  const checkoutAvailable = Boolean(process.env.STRIPE_SECRET_KEY);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight flex items-center gap-2">
          <Logo size={32} />
          <span className="text-emerald-400">speedyturtle</span>
        </Link>
        <nav className="flex gap-6 text-sm items-center">
          <Link href="/red-team" className="text-slate-300 hover:text-white">Red Team</Link>
          <Link href="/blue-team" className="text-slate-300 hover:text-white">Blue Team</Link>
          <Link href="/pricing" className="text-emerald-400 font-semibold">Pricing</Link>
          <Link href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-10 pb-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-5">
          Simple pricing · cancel anytime
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Predictable monthly cost.
          <br />
          <span className="text-emerald-400">No procurement cycle.</span>
        </h1>
        <p className="mt-5 text-lg text-slate-300 max-w-2xl mx-auto">
          Sell at $99/mo on a credit card while Snyk and Wiz are still on a discovery call.
          Pick a tier, drop in your email, finish checkout on Stripe.
        </p>
        <StatusBanner searchParamsPromise={searchParams} />
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-2xl border ${ACCENT_RING[tier.accent]} bg-slate-900/60 p-6 flex flex-col`}
            >
              <div className={`text-xs uppercase tracking-wider font-semibold mb-2 ${ACCENT_TEXT[tier.accent]}`}>
                {tier.name}
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-sm text-slate-400">{tier.cadence}</span>
              </div>
              <p className="text-sm text-slate-300 mb-5 leading-relaxed">{tier.blurb}</p>

              <ul className="space-y-2 mb-6 text-sm text-slate-300 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className={`${ACCENT_TEXT[tier.accent]} shrink-0`}>✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {tier.cta.kind === "link" ? (
                <Link
                  href={tier.cta.href}
                  className="block text-center w-full px-4 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-100 font-semibold"
                >
                  {tier.cta.label}
                </Link>
              ) : checkoutAvailable ? (
                <CheckoutButton tier={tier.cta.tier} label={tier.cta.label} accent={tier.accent} />
              ) : (
                <a
                  href={`mailto:kadinnestler@uptalk.us?subject=speedyturtle%20${tier.cta.tier}%20tier%20interest`}
                  className="block text-center w-full px-4 py-3 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold text-sm"
                >
                  Email me to enroll →
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16 text-sm text-slate-400">
        <h2 className="text-xl font-bold text-slate-200 mb-3">FAQ</h2>
        <div className="space-y-4">
          <div>
            <div className="font-semibold text-slate-200">How is &ldquo;a scan&rdquo; defined?</div>
            <p>One Red Team scan = one target domain run through subfinder → httpx → nuclei → Claude triage. Free is one per month per email; Starter is ten; Pro and Unlimited are uncapped.</p>
          </div>
          <div>
            <div className="font-semibold text-slate-200">Can I cancel?</div>
            <p>Yes — cancel from the Stripe customer portal anytime. Your subscription stays active until the end of the billing period, then drops to Free.</p>
          </div>
          <div>
            <div className="font-semibold text-slate-200">Do you offer annual pricing?</div>
            <p>Not yet. We&apos;ll add it once we have enough monthly subscribers to know the right discount.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
          <div>© {new Date().getFullYear()} speedyturtle. Part of the Tilacum stack.</div>
          <div className="flex gap-4">
            <a href="mailto:kadinnestler@uptalk.us" className="hover:text-slate-300">kadinnestler@uptalk.us</a>
            <a href="tel:+17813663500" className="hover:text-slate-300">(781) 366-3500</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

async function StatusBanner({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParamsPromise) ?? {};
  const status = sp.status;
  if (status === "success") {
    return (
      <div className="mt-6 inline-block px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
        Checkout complete. Your subscription will activate as soon as Stripe confirms payment.
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="mt-6 inline-block px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
        Checkout cancelled. No charge made — pick a tier when you&apos;re ready.
      </div>
    );
  }
  return null;
}
