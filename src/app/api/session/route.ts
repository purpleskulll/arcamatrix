import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    // Fetch session from Stripe
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    const session = await response.json();

    if (session.error) {
      console.error("Stripe error:", session.error);
      return NextResponse.json({ error: session.error.message }, { status: 400 });
    }

    // Extract relevant data
    const customerEmail = session.customer_details?.email || session.customer_email || "";
    const customerName = session.metadata?.customer_name || session.customer_details?.name || "";
    const skills = JSON.parse(session.metadata?.skills || "[]");

    return NextResponse.json({
      customerEmail,
      customerName,
      skills,
    });
  } catch (error) {
    console.error("Session API error:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
