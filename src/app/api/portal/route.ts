import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find Stripe customer by email
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }
    );

    const searchData = await searchRes.json();
    const customer = searchData.data?.[0];

    if (!customer) {
      return NextResponse.json(
        { error: "No subscription found for this email. Please check your email address." },
        { status: 404 }
      );
    }

    // Create a Stripe Customer Portal session
    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customer.id,
        return_url: "https://arcamatrix.com",
      }),
    });

    const portalData = await portalRes.json();

    if (portalData.url) {
      return NextResponse.json({ url: portalData.url });
    }

    return NextResponse.json(
      { error: "Could not create portal session. Please try again." },
      { status: 500 }
    );
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
