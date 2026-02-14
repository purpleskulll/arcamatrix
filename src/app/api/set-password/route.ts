import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

// Rate limiting per IP/session
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX = 5;
const WINDOW = 15 * 60 * 1000;
// Sessions older than 1 hour cannot set passwords
const SESSION_MAX_AGE = 3600;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (entry.count >= MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const { session_id, password } = await request.json();

    if (!session_id || !password) {
      return NextResponse.json({ error: "Missing session_id or password" }, { status: 400 });
    }

    if (!rateLimit(session_id)) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Fetch checkout session from Stripe to get customer ID
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const session = await sessionRes.json();

    if (session.error || !session.customer) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    // Check session age - reject sessions older than 1 hour
    const sessionCreated = session.created;
    if (sessionCreated && (Date.now() / 1000 - sessionCreated) > SESSION_MAX_AGE) {
      return NextResponse.json({ error: "Session expired. Please contact support." }, { status: 400 });
    }

    const customerId = session.customer;

    // Check if password is already set - prevent overwrite
    const customerRes = await fetch(
      `https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const customer = await customerRes.json();

    if (customer.metadata?.password_hash) {
      return NextResponse.json({
        error: "Password already set. Use the login page or contact support to reset."
      }, { status: 409 });
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Store hash in Stripe customer metadata
    const updateRes = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
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
