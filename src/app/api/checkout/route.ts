import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

const skillPrices: Record<string, number> = {
  "whatsapp": 500, // cents
  "telegram": 500,
  "discord": 500,
  "slack": 500,
  "email": 500,
  "imessage": 700,
  "signal": 500,
  "calendar": 300,
  "notion": 400,
  "obsidian": 400,
  "trello": 300,
  "github": 500,
  "spotify": 300,
  "youtube": 300,
  "hue": 300,
  "homekit": 400,
  "weather": 200,
  "web-search": 300,
  "voice": 800,
};

const BASE_PRICE = 1900; // $19 in cents

export async function POST(request: Request) {
  try {
    const { skills, email, name, username } = await request.json();

    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json({ error: "Invalid skills" }, { status: 400 });
    }

    // Calculate total
    const skillsTotal = skills.reduce((sum: number, id: string) => sum + (skillPrices[id] || 0), 0);
    const total = BASE_PRICE + skillsTotal;

    // Prepare checkout session parameters
    const params: Record<string, string> = {
      "mode": "subscription",
      "success_url": `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/`,
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][product_data][name]": "Arcamatrix AI Assistant",
      "line_items[0][price_data][product_data][description]": `Base + ${skills.length} skills: ${skills.join(", ")}`,
      "line_items[0][price_data][unit_amount]": total.toString(),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][quantity]": "1",
      "metadata[skills]": JSON.stringify(skills),
      "billing_address_collection": "required",
      "customer_creation": "always",
    };

    // Pre-fill customer email if provided
    if (email) {
      params["customer_email"] = email;
    }

    // Store name and username in metadata
    if (name) {
      params["metadata[customer_name]"] = name;
    }
    if (username) {
      params["metadata[username]"] = username;
    }

    // Create Stripe checkout session
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const session = await response.json();

    if (session.error) {
      console.error("Stripe error:", session.error);
      return NextResponse.json({ error: session.error.message }, { status: 400 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
