import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { loadTasks } from "@/lib/tasks";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_API_KEY || (() => {
  console.error("CRITICAL: Neither SESSION_SECRET nor ADMIN_API_KEY is set — portal auth will reject all requests");
  return "";
})();

// Rate limiting: in-memory store (resets on cold start, good enough for serverless)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): { allowed: boolean; remaining: number } {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

function resetRateLimit(email: string) {
  loginAttempts.delete(email.toLowerCase());
}

// --- HMAC session tokens (stateless) ---

async function hmacSign(data: string): Promise<string> {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET not configured");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createSessionToken(email: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours
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
    // Constant-time comparison
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0 ? email : null;
  } catch {
    return null;
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
    const { email, password, action, sessionToken } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Authenticated requests with session token
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

    // Login with email + password
    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Rate limiting
    const rateCheck = checkRateLimit(email);
    if (!rateCheck.allowed) {
      return NextResponse.json({
        error: "Too many login attempts. Please try again in 15 minutes."
      }, { status: 429 });
    }

    // Find customer in Stripe
    const customer = await findStripeCustomer(email);
    if (!customer) {
      return NextResponse.json({
        error: "No account found for this email."
      }, { status: 404 });
    }

    // Check password hash from Stripe metadata
    const storedHash = customer.metadata?.password_hash;
    if (!storedHash) {
      return NextResponse.json({
        error: "No password set. Please use the link in your welcome email or contact support."
      }, { status: 401 });
    }

    const valid = await verifyPassword(password, storedHash);
    if (!valid) {
      return NextResponse.json({
        error: `Invalid password. ${rateCheck.remaining} attempts remaining.`
      }, { status: 401 });
    }

    // Success — reset rate limit and create session
    resetRateLimit(email);
    const sessionTkn = await createSessionToken(email);
    const data = await getCustomerData(email, customer);
    return NextResponse.json({ ...data, sessionToken: sessionTkn });

  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
