import crypto from 'crypto';

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
 * Generate a secure random password
 */
function generatePassword(): string {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
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
 * Call Sprite API to create a new Sprite VM
 */
async function createSpriteViaAPI(
  spriteName: string
): Promise<{ success: boolean; spriteUrl?: string; error?: string }> {
  try {
    const SPRITE_API_TOKEN = process.env.SPRITE_API_TOKEN;
    const SPRITE_ORG = process.env.SPRITE_ORG || 'default';

    if (!SPRITE_API_TOKEN) {
      return {
        success: false,
        error: 'SPRITE_API_TOKEN not configured',
      };
    }

    // Call Sprite API to create VM
    const response = await fetch('https://api.sprites.cloud/v1/sprites', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SPRITE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: spriteName,
        org: SPRITE_ORG,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to create sprite: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
    const spriteUrl = data.url || `https://${spriteName}.sprites.app`;

    return {
      success: true,
      spriteUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: `Sprite creation failed: ${error}`,
    };
  }
}

/**
 * Install OpenClaw on the Sprite VM via API
 */
async function installOpenClawViaAPI(
  spriteName: string,
  skills: string[],
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const SPRITE_API_TOKEN = process.env.SPRITE_API_TOKEN;
    const SPRITE_ORG = process.env.SPRITE_ORG || 'default';

    if (!SPRITE_API_TOKEN) {
      return {
        success: false,
        error: 'SPRITE_API_TOKEN not configured',
      };
    }

    // Execute installation commands on the Sprite VM
    const installScript = `
#!/bin/bash
set -e

# Create user
sudo useradd -m -s /bin/bash ${username} || true
echo "${username}:${password}" | sudo chpasswd

# Install OpenClaw (placeholder - adjust based on actual installation method)
# This would be replaced with the actual OpenClaw installation commands
curl -fsSL https://openclaw.io/install.sh | bash || echo "OpenClaw install script placeholder"

# Configure skills: ${skills.join(', ')}
# Add skill configuration here

echo "Installation complete"
`.trim();

    const response = await fetch(`https://api.sprites.cloud/v1/sprites/${spriteName}/exec`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SPRITE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org: SPRITE_ORG,
        command: installScript,
        timeout: 300000, // 5 minutes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to install OpenClaw: ${response.status} ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `OpenClaw installation failed: ${error}`,
    };
  }
}

/**
 * Save customer record via external API (not filesystem)
 */
async function saveCustomerRecord(record: CustomerRecord): Promise<void> {
  try {
    const DATABASE_API_URL = process.env.DATABASE_API_URL;

    if (!DATABASE_API_URL) {
      console.warn('DATABASE_API_URL not configured, skipping customer record save');
      return;
    }

    // Save to external database/API instead of local filesystem
    const response = await fetch(`${DATABASE_API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN}`,
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      console.error('Failed to save customer record:', await response.text());
    } else {
      console.log('Customer record saved:', record.email);
    }
  } catch (error) {
    console.error('Error saving customer record:', error);
  }
}

/**
 * Main provisioning orchestration function
 */
export async function provisionCustomer(request: ProvisioningRequest): Promise<ProvisioningResult> {
  console.log('Starting provisioning for:', request.customerEmail);

  try {
    // Generate credentials
    const username = generateUsername(request.customerEmail, request.username);
    const password = generatePassword();

    console.log('Generated credentials for user:', username);

    // Generate sprite name
    const spriteName = `arca-${username}-${Date.now()}`;

    // Create Sprite VM via API
    const createResult = await createSpriteViaAPI(spriteName);

    if (!createResult.success) {
      console.error('Failed to create sprite:', createResult.error);
      return {
        success: false,
        error: createResult.error,
      };
    }

    console.log('Sprite created:', spriteName);

    // Install OpenClaw via API
    const installResult = await installOpenClawViaAPI(
      spriteName,
      request.skills,
      username,
      password
    );

    if (!installResult.success) {
      console.error('Failed to install OpenClaw:', installResult.error);
      return {
        success: false,
        error: installResult.error,
      };
    }

    console.log('OpenClaw installed on sprite:', spriteName);

    // Save customer record to external database
    const customerRecord: CustomerRecord = {
      email: request.customerEmail,
      name: request.customerName,
      username,
      password,
      spriteUrl: createResult.spriteUrl!,
      spriteName,
      skills: request.skills,
      stripeCustomerId: request.stripeCustomerId,
      subscriptionId: request.subscriptionId,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    await saveCustomerRecord(customerRecord);

    return {
      success: true,
      spriteName,
      spriteUrl: createResult.spriteUrl,
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
        'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN}`,
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
        'Authorization': `Bearer ${process.env.DATABASE_API_TOKEN}`,
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
