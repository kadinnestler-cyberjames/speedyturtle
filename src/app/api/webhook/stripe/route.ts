import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { upsertSubscription, markInactive, type Tier } from "@/lib/billing";

export const runtime = "nodejs";

function tierFromMetadata(value: unknown): Tier | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase();
  if (v === "starter" || v === "pro" || v === "unlimited" || v === "free") return v;
  return null;
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      {
        error: "Billing not configured",
        detail:
          "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set as environment variables. See STRIPE_SETUP.md.",
      },
      { status: 503 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown signature error";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata ?? {};
        const tier = tierFromMetadata(metadata.tier);
        const email =
          session.customer_details?.email?.toLowerCase() ||
          (typeof metadata.email === "string" ? metadata.email.toLowerCase() : "") ||
          (typeof session.customer_email === "string" ? session.customer_email.toLowerCase() : "");

        if (!email) {
          console.warn("checkout.session.completed: no email on session", session.id);
          return NextResponse.json({ received: true, warning: "missing email" });
        }
        if (!tier) {
          console.warn("checkout.session.completed: no tier metadata on session", session.id);
          return NextResponse.json({ received: true, warning: "missing tier" });
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        await upsertSubscription({
          email,
          tier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });
        console.log(`upserted subscription for ${email} tier=${tier}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await markInactive(subscription.id);
        console.log(`marked subscription inactive: ${subscription.id}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`invoice.payment_failed: invoice=${invoice.id} customer=${invoice.customer}`);
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
