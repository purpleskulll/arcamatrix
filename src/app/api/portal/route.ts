import { NextResponse } from "next/server";
import { loadTasks } from "@/lib/tasks";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const OTP_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "arcamatrix-otp-fallback";

// --- HMAC helpers (stateless OTP verification for serverless) ---

async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(OTP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateOTP(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

async function createChallenge(email: string, code: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 600; // 10 min
  const payload = `${email.toLowerCase()}:${code}:${expiry}`;
  const sig = await hmacSign(payload);
  // encode as base64: expiry.signature
  return Buffer.from(`${expiry}:${sig}`).toString('base64');
}

async function verifyChallenge(email: string, code: string, token: string): Promise<boolean> {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [expiryStr, sig] = decoded.split(':');
    const expiry = parseInt(expiryStr);
    if (Date.now() / 1000 > expiry) return false; // expired
    const payload = `${email.toLowerCase()}:${code}:${expiry}`;
    const expected = await hmacSign(payload);
    return sig === expected;
  } catch {
    return false;
  }
}

async function createSessionToken(email: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const payload = `session:${email.toLowerCase()}:${expiry}`;
  const sig = await hmacSign(payload);
  return Buffer.from(`${email.toLowerCase()}:${expiry}:${sig}`).toString('base64');
}

async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const parts = decoded.split(':');
    const sig = parts.pop()!;
    const expiry = parseInt(parts.pop()!);
    const email = parts.join(':');
    if (Date.now() / 1000 > expiry) return null;
    const payload = `session:${email}:${expiry}`;
    const expected = await hmacSign(payload);
    return sig === expected ? email : null;
  } catch {
    return null;
  }
}

// --- Email sending ---

async function sendOTPEmail(email: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith('re_PLACEHOLDER')) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Arcamatrix <noreply@arcamatrix.com>',
        to: [email],
        subject: `${code} - Your Arcamatrix Verification Code`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="text-align: center; color: #667eea;">Arcamatrix</h2>
            <p>Your verification code is:</p>
            <div style="text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f3f4f6; border-radius: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Stripe helpers ---

async function findStripeCustomer(email: string) {
  const searchRes = await fetch(
    `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
  );
  const searchData = await searchRes.json();
  return searchData.data?.[0] || null;
}

async function getSubscription(customerId: string) {
  const subsRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
  );
  const subsData = await subsRes.json();
  return subsData.data?.[0] || null;
}

async function getCustomerData(email: string, customer: { id: string; name: string; email: string }) {
  const subscription = await getSubscription(customer.id);

  let skills: string[] = [];
  let workspaceUrl = "";
  let username = "";

  try {
    const store = await loadTasks();
    for (const task of Object.values(store.tasks)) {
      if (
        task.type === "provisioning" &&
        task.status === "completed" &&
        task.metadata?.customerEmail?.toLowerCase() === email.toLowerCase() &&
        task.result?.success
      ) {
        skills = task.metadata.skills || [];
        username = task.metadata.username || "";
        workspaceUrl = task.result.sprite_url || `https://${username}.arcamatrix.com`;
        break;
      }
    }
  } catch {
    // continue without skills
  }

  return {
    customer: {
      name: customer.name || email.split("@")[0],
      email: customer.email || email,
    },
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    } : null,
    skills,
    username,
    workspaceUrl,
  };
}

// --- Main handler ---

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, action, code, challengeToken, sessionToken } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // ACTION: Authenticated requests using session token
    if (sessionToken) {
      const verifiedEmail = await verifySessionToken(sessionToken);
      if (!verifiedEmail || verifiedEmail !== email.toLowerCase()) {
        return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
      }

      // Portal redirect (manage subscription)
      if (action === "portal") {
        const customer = await findStripeCustomer(email);
        if (!customer) {
          return NextResponse.json({ error: "Customer not found." }, { status: 404 });
        }
        const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            customer: customer.id,
            return_url: "https://arcamatrix.com/login",
          }),
        });
        const portalData = await portalRes.json();
        if (portalData.url) {
          return NextResponse.json({ url: portalData.url });
        }
        return NextResponse.json({ error: "Could not create portal session." }, { status: 500 });
      }

      // Default: return dashboard data
      const customer = await findStripeCustomer(email);
      if (!customer) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      const data = await getCustomerData(email, customer);
      return NextResponse.json(data);
    }

    // STEP 2: Verify OTP code
    if (action === "verify" && code && challengeToken) {
      const valid = await verifyChallenge(email, code, challengeToken);
      if (!valid) {
        return NextResponse.json({ error: "Invalid or expired code. Please try again." }, { status: 401 });
      }

      // Code verified — create session and return dashboard data
      const customer = await findStripeCustomer(email);
      if (!customer) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }

      const sessionTkn = await createSessionToken(email);
      const data = await getCustomerData(email, customer);
      return NextResponse.json({ ...data, sessionToken: sessionTkn });
    }

    // STEP 1: Send OTP code
    const customer = await findStripeCustomer(email);
    if (!customer) {
      return NextResponse.json(
        { error: "No subscription found for this email. Please check your email address." },
        { status: 404 }
      );
    }

    const otp = generateOTP();
    const challenge = await createChallenge(email, otp);
    const sent = await sendOTPEmail(email, otp);

    if (!sent) {
      return NextResponse.json({ error: "Could not send verification email. Please try again." }, { status: 500 });
    }

    return NextResponse.json({
      step: "verify",
      challengeToken: challenge,
      message: "Verification code sent to your email.",
    });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
