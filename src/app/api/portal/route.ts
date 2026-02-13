import { NextResponse } from "next/server";
import { loadTasks } from "@/lib/tasks";

export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export async function POST(request: Request) {
  try {
    const { email, action } = await request.json();

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

    // If action is "portal", create Stripe portal session and redirect
    if (action === "portal") {
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

    // Default: return customer info (subscription + skills + workspace URL)
    // Get active subscriptions
    const subsRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
      {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }
    );
    const subsData = await subsRes.json();
    const subscription = subsData.data?.[0];

    // Look up skills and workspace URL from our task store
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
      // Tasks lookup failed, continue without skills
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
