import { NextResponse } from "next/server";
import { validateSkillIds, getSkillPricesInCents } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const BASE_PRICE_CENTS = 1900;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skills } = body;

    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json({ error: "Invalid skills" }, { status: 400 });
    }

    const skillValidation = validateSkillIds(skills);
    if (!skillValidation.valid) {
      return NextResponse.json({ error: "Invalid skill IDs" }, { status: 400 });
    }

    const skillPrices = getSkillPricesInCents();
    const skillsTotal = skills.reduce((sum: number, id: string) => sum + (skillPrices[id] || 0), 0);
    const total = BASE_PRICE_CENTS + skillsTotal;

    // Hardcoded URLs - simple and reliable
    const successUrl = "https://arcamatrix.com/success?session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = "https://arcamatrix.com/";

    const params = new URLSearchParams({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][product_data][name]": "Arcamatrix AI Assistant",
      "line_items[0][price_data][product_data][description]": `Base + ${skills.length} skills`,
      "line_items[0][price_data][unit_amount]": total.toString(),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][quantity]": "1",
      "billing_address_collection": "required",
      "customer_creation": "always",
      "metadata[skills]": JSON.stringify(skills),
    });

    console.log("Creating Stripe checkout session...");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await response.json();

    if (!response.ok || session.error) {
      console.error("Stripe error:", session);
      return NextResponse.json({ error: session.error?.message || "Checkout failed" }, { status: 400 });
    }

    if (!session.url) {
      console.error("No URL in response:", session);
      return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
    }

    console.log("Success! Checkout URL:", session.url);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
