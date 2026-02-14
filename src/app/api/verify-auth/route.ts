import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

// Rate limiting per email
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX = 5;
const WINDOW = 15 * 60 * 1000;

function rateLimit(email: string): boolean {
  const key = email.toLowerCase();
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

function resetLimit(email: string) {
  attempts.delete(email.toLowerCase());
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    if (!rateLimit(email)) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    // Find customer in Stripe
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const searchData = await searchRes.json();
    const customer = searchData.data?.[0];

    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storedHash = customer.metadata?.password_hash;
    if (!storedHash) {
      return NextResponse.json({ error: "No password set" }, { status: 401 });
    }

    const valid = await verifyPassword(password, storedHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    resetLimit(email);
    return NextResponse.json({ success: true, name: customer.name || email.split("@")[0] });
  } catch (error) {
    console.error("Verify-auth error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
