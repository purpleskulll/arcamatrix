import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export async function POST(request: Request) {
  try {
    const { session_id, password } = await request.json();

    if (!session_id || !password) {
      return NextResponse.json({ error: "Missing session_id or password" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Fetch checkout session from Stripe to get customer ID
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const session = await sessionRes.json();

    if (session.error || !session.customer) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    // Check session is actually paid
    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    const customerId = session.customer;

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Store hash in Stripe customer metadata
    const updateRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "metadata[password_hash]": passwordHash,
      }),
    });

    const updateData = await updateRes.json();
    if (updateData.error) {
      return NextResponse.json({ error: "Failed to save password" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Set-password error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
