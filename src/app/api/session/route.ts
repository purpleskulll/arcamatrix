import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const MAX_SESSION_AGE = 7200; // 2 hours

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId || !/^cs_/.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session_id" }, { status: 400 });
    }

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` } }
    );

    const session = await response.json();

    if (session.error) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    if (session.created && (Date.now() / 1000 - session.created) > MAX_SESSION_AGE) {
      return NextResponse.json({ error: "Session expired" }, { status: 400 });
    }

    const customerEmail = session.customer_details?.email || session.customer_email || "";
    const customerName = session.metadata?.customer_name || session.customer_details?.name || "";
    let skills: string[] = [];
    try {
      skills = JSON.parse(session.metadata?.skills || "[]");
    } catch {
      skills = [];
    }

    return NextResponse.json({ customerEmail, customerName, skills });
  } catch (error) {
    console.error("Session API error:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
