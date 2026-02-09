import { NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email";

// Force dynamic rendering - prevent static generation at build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Tasks stored on Vercel via /api/tasks
const TASKS_API_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://arcamatrix.com";

async function verifyStripeSignature(payload: string, signature: string): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET not configured");
    return false;
  }

  const timestamp = signature.split(",")[0]?.split("=")[1];
  const sig = signature.split(",")[1]?.split("=")[1];

  if (!timestamp || !sig) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  // Use Web Crypto API instead of Node.js crypto
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature_bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const expectedSig = Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (sig.length !== expectedSig.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  return result === 0;
}

function generateUsername(email: string): string {
  // Extract username from email and sanitize
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  return base.substring(0, 16);
}

function generateTaskId(): string {
  // Generate PROV-YYYYMMDD-XXXX format
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PROV-${date}-${random}`;
}

async function createProvisioningTask(data: {
  customerEmail: string;
  customerName: string;
  username: string;
  password: string;
  skills: string[];
  stripeCustomerId: string;
  subscriptionId: string;
}) {
  const taskId = generateTaskId();

  const response = await fetch(`${TASKS_API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, type: "provisioning", status: "pending", metadata: data })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create task: ${err}`);
  }

  return taskId;
}

async function createRecycleTask(username: string, subscriptionId: string) {
  const taskId = `RECYCLE-${Date.now()}`;

  const response = await fetch(`${TASKS_API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, type: "recycle", status: "pending", metadata: { username, subscriptionId } })
  });

  if (!response.ok) {
    throw new Error(`Failed to create recycle task: ${response.statusText}`);
  }

  return taskId;
}

async function findUsernameBySubscription(subscriptionId: string): Promise<string | null> {
  try {
    const response = await fetch(`${TASKS_API_BASE}/api/tasks?subscriptionId=${subscriptionId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.username || null;
  } catch (error) {
    console.error("Failed to lookup username:", error);
    return null;
  }
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
    if (signature && !(await verifyStripeSignature(body, signature))) {
      console.error("Invalid Stripe signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email || session.customer_email || "unknown";
      const customerName = session.metadata?.customer_name || session.customer_details?.name || customerEmail.split("@")[0];
      const skills = JSON.parse(session.metadata?.skills || "[]");
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      // Generate username and password
      const username = generateUsername(customerEmail);
      const password = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      console.log("Processing checkout.session.completed for:", customerEmail);

      // Create provisioning task in blackboard
      try {
        const taskId = await createProvisioningTask({
          customerEmail,
          customerName,
          username,
          password,
          skills,
          stripeCustomerId,
          subscriptionId,
        });

        console.log(`✅ Provisioning task created: ${taskId}`);

        // Send welcome email with credentials (provisioning will happen async)
        const spriteUrl = `https://${username}.arcamatrix.com`;
        const emailResult = await sendWelcomeEmail({
          customerEmail,
          customerName,
          username,
          password,
          spriteUrl,
          skills,
        });

        if (emailResult.success) {
          console.log("Welcome email sent successfully");
        } else {
          console.error("Failed to send welcome email:", emailResult.error);
        }

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

**Status:** PENDING (agent will provision automatically)
**Welcome Email:** ${emailResult.success ? "✓ Sent" : "✗ Failed"}
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
          const taskId = await createRecycleTask(username, subscriptionId);
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
