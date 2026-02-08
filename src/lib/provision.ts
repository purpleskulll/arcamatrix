export interface ProvisioningRequest {
  customerEmail: string;
  customerName: string;
  username?: string;
  skills: string[];
  stripeCustomerId: string;
  subscriptionId: string;
}

export interface ProvisioningResult {
  success: boolean;
  spriteName?: string;
  spriteUrl?: string;
  username?: string;
  password?: string;
  error?: string;
}

export interface CustomerRecord {
  email: string;
  name: string;
  username: string;
  password: string;
  spriteUrl: string;
  spriteName: string;
  skills: string[];
  stripeCustomerId: string;
  subscriptionId: string;
  createdAt: string;
  status: 'active' | 'provisioning' | 'failed';
}

/**
 * Generate a secure random password using Web Crypto API or fallback
 */
function generatePassword(): string {
  // Use crypto.randomUUID() as a base for password generation
  const uuid = crypto.randomUUID().replace(/-/g, '');
  // Take first 20 characters for a strong password
  return uuid.substring(0, 20);
}

/**
 * Generate username from email or use provided username
 */
function generateUsername(email: string, providedUsername?: string): string {
  if (providedUsername && providedUsername.trim().length > 0) {
    return providedUsername.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  const emailPrefix = email.split('@')[0];
  return emailPrefix.replace(/[^a-z0-9]/g, '').substring(0, 20);
}

/**
 * Save customer record - logs to console for now
 * In production, this would POST to an external API
 */
async function saveCustomerRecord(record: CustomerRecord): Promise<void> {
  console.log('Customer record created:', {
    email: record.email,
    username: record.username,
    spriteName: record.spriteName,
    spriteUrl: record.spriteUrl,
    skills: record.skills,
    status: record.status,
    createdAt: record.createdAt,
  });

  // Optional: POST to external API if DATABASE_API_URL is configured
  try {
    const DATABASE_API_URL = process.env.DATABASE_API_URL;
    if (DATABASE_API_URL) {
      const response = await fetch(`${DATABASE_API_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN || ''}`,
        },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        console.error('Failed to save customer record to API:', await response.text());
      }
    }
  } catch (error) {
    console.error('Error posting customer record to API:', error);
  }
}

/**
 * Main provisioning function - simplified for serverless
 * Generates credentials and returns provisioning result
 * Actual Sprite VM provisioning happens via Linear ticket automation
 */
export async function provisionCustomer(request: ProvisioningRequest): Promise<ProvisioningResult> {
  console.log('Starting provisioning for:', request.customerEmail);

  try {
    // Generate credentials
    const username = generateUsername(request.customerEmail, request.username);
    const password = generatePassword();

    console.log('Generated credentials for user:', username);

    // Generate sprite name
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const spriteName = `arca-${username}-${timestamp}-${randomSuffix}`;

    // Use custom subdomain instead of .sprites.app
    const spriteUrl = `https://${username}.arcamatrix.com`;
    const internalSpriteUrl = `https://${spriteName}.sprites.app`;

    console.log('Sprite provisioning scheduled:', spriteName);

    // Save customer record (logs to console + optional API call)
    const customerRecord: CustomerRecord = {
      email: request.customerEmail,
      name: request.customerName,
      username,
      password,
      spriteUrl,
      spriteName,
      skills: request.skills,
      stripeCustomerId: request.stripeCustomerId,
      subscriptionId: request.subscriptionId,
      createdAt: new Date().toISOString(),
      status: 'provisioning', // Will be updated to 'active' after Linear automation completes
    };

    // Store internal sprite URL in metadata for provisioning
    (customerRecord as any).internalSpriteUrl = internalSpriteUrl;

    await saveCustomerRecord(customerRecord);

    // Return success with generated credentials
    // Note: The actual sprite VM will be created asynchronously via Linear automation
    return {
      success: true,
      spriteName,
      spriteUrl,
      username,
      password,
    };
  } catch (error) {
    console.error('Provisioning error:', error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get customer by email (via external API)
 */
export async function getCustomerByEmail(email: string): Promise<CustomerRecord | null> {
  try {
    const DATABASE_API_URL = process.env.DATABASE_API_URL;

    if (!DATABASE_API_URL) {
      console.warn('DATABASE_API_URL not configured');
      return null;
    }

    const response = await fetch(`${DATABASE_API_URL}/customers?email=${encodeURIComponent(email)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN || ''}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.customer || null;
  } catch (error) {
    console.error('Error fetching customer by email:', error);
    return null;
  }
}

/**
 * Get customer by Stripe customer ID (via external API)
 */
export async function getCustomerByStripeId(stripeCustomerId: string): Promise<CustomerRecord | null> {
  try {
    const DATABASE_API_URL = process.env.DATABASE_API_URL;

    if (!DATABASE_API_URL) {
      console.warn('DATABASE_API_URL not configured');
      return null;
    }

    const response = await fetch(`${DATABASE_API_URL}/customers?stripeCustomerId=${encodeURIComponent(stripeCustomerId)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN || ''}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.customer || null;
  } catch (error) {
    console.error('Error fetching customer by Stripe ID:', error);
    return null;
  }
}
