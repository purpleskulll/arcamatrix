import { NextResponse } from "next/server";
import crypto from "crypto";

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
      const customerEmail = session.customer_details?.email || "unknown";
      const skills = JSON.parse(session.metadata?.skills || "[]");

      // Create Linear ticket for provisioning
      const issueTitle = `[PROVISION] New Arcamatrix for ${customerEmail}`;
      const issueDescription = `
## New Customer Provisioning Request

**Customer Email:** ${customerEmail}
**Stripe Session ID:** ${session.id}
**Subscription ID:** ${session.subscription}

### Selected Skills
${skills.map((s: string) => `- ${s}`).join("\n")}

### Actions Required
1. Spin up new Sprite VM
2. Install CLAWDBOT with selected skills
3. Configure Gatekeeper security
4. Send welcome email with dashboard link

**Status:** PROVISIONING_REQUIRED
      `.trim();

      const result = await createLinearIssue(issueTitle, issueDescription, []);
      console.log("Linear issue created:", result);

      return NextResponse.json({ received: true, linear: result });
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
