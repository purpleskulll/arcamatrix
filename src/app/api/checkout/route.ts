import { NextResponse } from "next/server";
import { validateSkillIds, getSkillPricesInCents } from "@/lib/skills";

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const BASE_PRICE_CENTS = 1900; // $19 in cents

interface CheckoutRequest {
  skills: string[];
  email?: string;
  name?: string;
  username?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeString(input: string, maxLength: number = 100): string {
  return input.trim().substring(0, maxLength);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CheckoutRequest;
    const { skills, email, name, username } = body;

    // Validate skills array
    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json(
        { error: "Invalid skills: must be an array" },
        { status: 400 }
      );
    }

    // Validate skill IDs
    const skillValidation = validateSkillIds(skills);
    if (!skillValidation.valid) {
      return NextResponse.json(
        { error: "Invalid skill IDs", invalid: skillValidation.invalid },
        { status: 400 }
      );
    }

    // Validate email if provided
    if (email && !validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Sanitize name and username
    const sanitizedName = name ? sanitizeString(name, 100) : undefined;
    const sanitizedUsername = username ? sanitizeString(username, 50) : undefined;

    // Log environment variables status
    console.log("Environment check:", {
      hasStripeKey: !!STRIPE_SECRET_KEY,
      stripeKeyPrefix: STRIPE_SECRET_KEY.substring(0, 7),
      nextPublicUrl: process.env.NEXT_PUBLIC_URL,
      nodeEnv: process.env.NODE_ENV,
    });

    // Get skill prices from centralized source
    const skillPrices = getSkillPricesInCents();

    // Calculate total
    const skillsTotal = skills.reduce(
      (sum: number, id: string) => sum + (skillPrices[id] || 0),
      0
    );
    const total = BASE_PRICE_CENTS + skillsTotal;

    // Build URLs with explicit fallback logic
    // Get baseUrl from request headers (more reliable than NEXT_PUBLIC_URL)
    const host = request.headers.get("host") || "arcamatrix.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = process.env.NEXT_PUBLIC_URL || `${protocol}://${host}`;
    
    console.log("Request host:", host);
    console.log("Derived baseUrl:", baseUrl);
    
    // Stripe checkout URLs
    const successUrl = `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/`;

    console.log("Checkout URLs:", { baseUrl, successUrl, cancelUrl });

    // Prepare checkout session parameters
    const params: Record<string, string> = {
      "mode": "subscription",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
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
    if (sanitizedName) {
      params["metadata[customer_name]"] = sanitizedName;
    }
    if (sanitizedUsername) {
      params["metadata[username]"] = sanitizedUsername;
    }

    console.log("Creating Stripe session with params:", {
      mode: params.mode,
      skills: skills,
      total: total,
    });

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

    console.log("Stripe response status:", response.status);
    console.log("Stripe response:", JSON.stringify(session, null, 2));

    // Check for errors in response
    if (!response.ok || session.error) {
      const errorMessage = session.error?.message || session.error || "Unknown Stripe error";
      console.error("Stripe error details:", {
        status: response.status,
        error: session.error,
        fullResponse: session,
      });
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Validate that we got a URL
    if (!session.url) {
      console.error("No URL in Stripe response:", session);
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 500 }
      );
    }

    console.log("Successfully created checkout session:", {
      sessionId: session.id,
      url: session.url,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
