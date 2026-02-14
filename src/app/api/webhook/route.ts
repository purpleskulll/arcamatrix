import { NextResponse } from "next/server";
import { createTask, findBySubscription, findByEventId } from "@/lib/tasks";

// Force dynamic rendering - prevent static generation at build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const TIMESTAMP_TOLERANCE = 300; // 5 minutes

async function verifyStripeSignature(payload: string, signature: string): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not configured — rejecting all webhooks");
    return false;
  }

  // Parse signature header: t=timestamp,v1=sig1,v1=sig2,...
  const parts = signature.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    if (key === "t") acc.timestamp = val;
    if (key === "v1") acc.signatures.push(val);
    return acc;
  }, { timestamp: "", signatures: [] as string[] });

  if (!parts.timestamp || parts.signatures.length === 0) {
    return false;
  }

  // Check timestamp tolerance (prevent replay attacks)
  const ts = parseInt(parts.timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE) {
    console.warn("Stripe webhook timestamp too old/new");
    return false;
  }

  const signedPayload = `${parts.timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Check if ANY v1 signature matches (constant-time)
  for (const sig of parts.signatures) {
    if (sig.length !== expectedSig.length) continue;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (diff === 0) return true;
  }

  return false;
}

function generateUsername(email: string): string {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (base.length === 0) {
    // Fallback for emails with no alphanumeric prefix
    const hash = Array.from(new Uint8Array(crypto.getRandomValues(new Uint8Array(4))))
      .map(b => b.toString(36)).join('');
    return `user${hash}`;
  }
  return base.substring(0, 16);
}

function generateTaskId(): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = crypto.randomUUID().split('-')[0]; // 8 hex chars = 4 billion possibilities
  return `PROV-${date}-${random}`;
}

async function createProvisioningTask(data: {
  customerEmail: string;
  customerName: string;
  username: string;
  gatewayToken: string;
  skills: string[];
  stripeCustomerId: string;
  subscriptionId: string;
}) {
  const taskId = generateTaskId();
  await createTask(taskId, "provisioning", data);
  return taskId;
}

async function createRecycleTask(username: string, subscriptionId: string, stripeEventId: string) {
  const taskId = `RECYCLE-${Date.now()}`;
  await createTask(taskId, "recycle", { username, subscriptionId, stripeEventId });
  return taskId;
}

async function findUsernameBySubscription(subscriptionId: string): Promise<string | null> {
  const result = await findBySubscription(subscriptionId);
  return result?.username || null;
}

async function createLinearIssue(title: string, description: string, labels: string[]) {
  const query = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": LINEAR_API_KEY,
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          teamId: LINEAR_TEAM_ID,
          title,
          description,
          labelIds: labels,
        },
      },
    }),
  });

  return response.json();
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Verify Stripe signature
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }
    const sigValid = await verifyStripeSignature(body, signature);
    if (!sigValid) {
      console.error("Stripe signature verification failed — rejecting webhook");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    // Idempotency: reject already-processed events
    const existingTaskId = await findByEventId(event.id);
    if (existingTaskId) {
      console.log(`Duplicate webhook event ${event.id} — already processed as ${existingTaskId}`);
      return NextResponse.json({ received: true, duplicate: true, taskId: existingTaskId });
    }

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email || session.customer_email || "unknown";
      const customerName = session.metadata?.customer_name || session.customer_details?.name || customerEmail.split("@")[0];
      const skills = JSON.parse(session.metadata?.skills || "[]");
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      // Generate username and gateway token
      const username = generateUsername(customerEmail);
      const gatewayToken = Array.from(crypto.getRandomValues(new Uint8Array(18)))
        .map(b => b.toString(36).padStart(2, '0')).join('').substring(0, 24);

      console.log("Processing checkout.session.completed for:", customerEmail);

      // Create provisioning task - email will be sent by provisioning agent after completion
      try {
        const taskId = await createProvisioningTask({
          customerEmail,
          customerName,
          username,
          gatewayToken,
          skills,
          stripeCustomerId,
          subscriptionId,
          stripeEventId: event.id,
        });

        const spriteUrl = `https://${username}.arcamatrix.com`;
        console.log(`Provisioning task created: ${taskId} - email will be sent after provisioning`);

        // Create Linear ticket for tracking
        const issueTitle = `[PROVISIONING] ${customerEmail} - Task ${taskId}`;
        const issueDescription = `
## Customer Provisioning Started

**Task ID:** ${taskId}
**Customer Email:** ${customerEmail}
**Customer Name:** ${customerName}
**Username:** ${username}
**Customer URL:** ${spriteUrl}
**Stripe Customer ID:** ${stripeCustomerId}
**Subscription ID:** ${subscriptionId}

### Selected Skills
${skills.map((s: string) => `- ${s}`).join("\n")}

**Status:** PENDING (agent will provision and send welcome email)
        `.trim();

        await createLinearIssue(issueTitle, issueDescription, []);

        return NextResponse.json({
          received: true,
          taskId,
          username,
          spriteUrl
        });
      } catch (error) {
        console.error("Failed to create provisioning task:", error);

        // Create Linear ticket for manual intervention
        const issueTitle = `[PROVISION FAILED] ${customerEmail}`;
        const issueDescription = `
## Provisioning Task Creation Failed

**Customer Email:** ${customerEmail}
**Customer Name:** ${customerName}
**Stripe Session ID:** ${session.id}
**Subscription ID:** ${subscriptionId}
**Error:** ${error instanceof Error ? error.message : String(error)}

### Selected Skills
${skills.map((s: string) => `- ${s}`).join("\n")}

### Actions Required
1. Manually create PROV-* task in blackboard
2. Or manually provision Sprite VM
3. Send welcome email with credentials

**Status:** MANUAL_INTERVENTION_REQUIRED
        `.trim();

        await createLinearIssue(issueTitle, issueDescription, []);

        return NextResponse.json({
          received: true,
          error: "Failed to create provisioning task"
        }, { status: 500 });
      }
    }

    // Handle subscription cancellation
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;
      const customerId = subscription.customer;

      console.log("Processing customer.subscription.deleted for:", subscriptionId);

      // Find username by searching for subscriptionId
      try {
        const username = await findUsernameBySubscription(subscriptionId);

        if (username) {
          // Create recycling task
          const taskId = await createRecycleTask(username, subscriptionId, event.id);
          console.log(`✅ Recycling task created: ${taskId}`);

          const issueTitle = `[RECYCLE] ${username} - Task ${taskId}`;
          const issueDescription = `
## Subscription Cancelled - Recycling Sprite

**Task ID:** ${taskId}
**Username:** ${username}
**Subscription ID:** ${subscriptionId}
**Customer ID:** ${customerId}

### Actions (Automated)
1. ✓ Clean customer data from sprite
2. ✓ Remove customer mapping from proxy
3. ✓ Return sprite to available pool

**Status:** PENDING (agent will recycle automatically)
          `.trim();

          await createLinearIssue(issueTitle, issueDescription, []);

          return NextResponse.json({
            received: true,
            taskId,
            username
          });
        } else {
          console.warn("Could not find username for subscription:", subscriptionId);

          const issueTitle = `[MANUAL RECYCLE] Subscription ${subscriptionId}`;
          const issueDescription = `
## Subscription Cancelled - Manual Cleanup Required

**Subscription ID:** ${subscriptionId}
**Customer ID:** ${customerId}

**Issue:** Could not automatically identify username/sprite for this subscription.

### Actions Required
1. Manually lookup customer by subscription ID
2. Run: \`python3 /home/sprite/recycle_sprite.py <username>\`
3. Verify sprite returned to pool

**Status:** MANUAL_CLEANUP_REQUIRED
          `.trim();

          await createLinearIssue(issueTitle, issueDescription, []);

          return NextResponse.json({
            received: true,
            warning: "Manual cleanup required"
          });
        }
      } catch (error) {
        console.error("Failed to create recycling task:", error);

        return NextResponse.json({
          received: true,
          error: "Failed to create recycling task"
        }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
