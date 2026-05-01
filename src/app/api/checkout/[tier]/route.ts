import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

type Tier = "starter" | "pro" | "unlimited";

const PRICE_ENV: Record<Tier, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  pro: "STRIPE_PRICE_ID_PRO",
  unlimited: "STRIPE_PRICE_ID_UNLIMITED",
};

function isTier(t: string): t is Tier {
  return t === "starter" || t === "pro" || t === "unlimited";
}

function resolveOrigin(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const url = new URL(req.url);
    if (url.origin && !url.origin.startsWith("http://localhost")) {
      return url.origin;
    }
  } catch {
    // ignore
  }
  return "https://speedyturtle-smb.vercel.app";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tier: string }> }
) {
  try {
    const { tier: rawTier } = await params;
    const tier = (rawTier || "").toLowerCase();
    if (!isTier(tier)) {
      return NextResponse.json(
        { error: `Unknown tier '${rawTier}'. Must be starter, pro, or unlimited.` },
        { status: 400 }
      );
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env[PRICE_ENV[tier]];
    if (!secretKey || !priceId) {
      return NextResponse.json(
        {
          error: "Billing not configured",
          detail:
            "STRIPE_SECRET_KEY and the per-tier price IDs must be set as environment variables. See STRIPE_SETUP.md.",
        },
        { status: 503 }
      );
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const stripe = new Stripe(secretKey);
    const origin = resolveOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${origin}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?status=cancelled`,
      metadata: { tier, email },
      subscription_data: {
        metadata: { tier, email },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
