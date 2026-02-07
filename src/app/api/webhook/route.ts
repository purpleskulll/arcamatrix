import { NextResponse } from "next/server";
import crypto from "crypto";
import { provisionCustomer } from "@/lib/provision";
import { sendWelcomeEmail, sendProvisioningFailureEmail } from "@/lib/email";

// Force dynamic rendering - prevent static generation at build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function verifyStripeSignature(payload: string, signature: string): boolean {
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
  const expectedSig = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
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
    if (signature && !verifyStripeSignature(body, signature)) {
      console.error("Invalid Stripe signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email || session.customer_email || "unknown";
      const customerName = session.metadata?.customer_name || session.customer_details?.name || customerEmail.split("@")[0];
      const username = session.metadata?.username;
      const skills = JSON.parse(session.metadata?.skills || "[]");
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      console.log("Processing checkout.session.completed for:", customerEmail);

      // Provision the sprite and install OpenClaw
      const provisioningResult = await provisionCustomer({
        customerEmail,
        customerName,
        username,
        skills,
        stripeCustomerId,
        subscriptionId,
      });

      if (provisioningResult.success) {
        console.log("Provisioning successful:", provisioningResult.spriteName);

        // Send welcome email with credentials
        const emailResult = await sendWelcomeEmail({
          customerEmail,
          customerName,
          username: provisioningResult.username!,
          password: provisioningResult.password!,
          spriteUrl: provisioningResult.spriteUrl!,
          skills,
        });

        if (emailResult.success) {
          console.log("Welcome email sent successfully");
        } else {
          console.error("Failed to send welcome email:", emailResult.error);
        }

        // Create Linear ticket for tracking
        const issueTitle = `[PROVISIONED] ${customerEmail} - ${provisioningResult.spriteName}`;
        const issueDescription = `
## Customer Provisioned Successfully

**Customer Email:** ${customerEmail}
**Customer Name:** ${customerName}
**Sprite Name:** ${provisioningResult.spriteName}
**Sprite URL:** ${provisioningResult.spriteUrl}
**Username:** ${provisioningResult.username}
**Stripe Customer ID:** ${stripeCustomerId}
**Subscription ID:** ${subscriptionId}

### Selected Skills
${skills.map((s: string) => `- ${s}`).join("\n")}

**Status:** ACTIVE
**Welcome Email:** ${emailResult.success ? "✓ Sent" : "✗ Failed"}
        `.trim();

        await createLinearIssue(issueTitle, issueDescription, []);

        return NextResponse.json({
          received: true,
          provisioned: true,
          spriteName: provisioningResult.spriteName
        });
      } else {
        console.error("Provisioning failed:", provisioningResult.error);

        // Send failure email
        await sendProvisioningFailureEmail(customerEmail, customerName);

        // Create Linear ticket for manual intervention
        const issueTitle = `[PROVISION FAILED] ${customerEmail}`;
        const issueDescription = `
## Provisioning Failed - Manual Intervention Required

**Customer Email:** ${customerEmail}
**Customer Name:** ${customerName}
**Stripe Session ID:** ${session.id}
**Subscription ID:** ${subscriptionId}
**Error:** ${provisioningResult.error}

### Selected Skills
${skills.map((s: string) => `- ${s}`).join("\n")}

### Actions Required
1. Manually provision Sprite VM
2. Install CLAWDBOT with selected skills
3. Send welcome email with credentials
4. Update customer record

**Status:** MANUAL_PROVISIONING_REQUIRED
        `.trim();

        await createLinearIssue(issueTitle, issueDescription, []);

        return NextResponse.json({
          received: true,
          provisioned: false,
          error: provisioningResult.error
        });
      }
    }

    // Handle subscription cancellation
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      const issueTitle = `[TERMINATE] Subscription cancelled: ${subscription.id}`;
      const issueDescription = `
## Subscription Cancellation

**Subscription ID:** ${subscription.id}
**Customer ID:** ${subscription.customer}

### Actions Required
1. Identify associated Sprite VM
2. Backup customer data (if applicable)
3. Terminate Sprite VM
4. Update customer status

**Status:** TERMINATION_REQUIRED
      `.trim();

      const result = await createLinearIssue(issueTitle, issueDescription, []);
      console.log("Linear issue created for termination:", result);

      return NextResponse.json({ received: true, linear: result });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
