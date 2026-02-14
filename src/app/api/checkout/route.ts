import { NextResponse } from "next/server";
import { VALID_SKILL_IDS } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || (() => {
  console.error("CRITICAL: STRIPE_SECRET_KEY is not set — checkout will fail");
  return "";
})();
const BASE_PRICE_CENTS = 700; // $7/month base subscription

function validateSkillIds(skillIds: string[]): { valid: boolean; invalid: string[] } {
  const invalid = skillIds.filter(id => !VALID_SKILL_IDS.has(id));
  return { valid: invalid.length === 0, invalid };
}

export async function POST(request: Request) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { skills } = body;

    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json({ error: "Invalid skills" }, { status: 400 });
    }

    const skillValidation = validateSkillIds(skills);
    if (!skillValidation.valid) {
      return NextResponse.json({ error: "Invalid skill IDs" }, { status: 400 });
    }

    const successUrl = "https://arcamatrix.com/success?session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = "https://arcamatrix.com/";

    const params = new URLSearchParams({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": "Arcamatrix AI Assistant",
      "line_items[0][price_data][product_data][description]": `All-inclusive plan with ${skills.length} skills`,
      "line_items[0][price_data][unit_amount]": BASE_PRICE_CENTS.toString(),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][quantity]": "1",
      "billing_address_collection": "required",
      "allow_promotion_codes": "true",
      "metadata[skills]": JSON.stringify(skills),
    });

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
      return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
