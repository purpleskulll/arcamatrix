import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
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
 * Call Python provisioner script to create sprite and install OpenClaw
 */
async function callPythonProvisioner(
  email: string,
  skills: string[],
  username: string
): Promise<{ success: boolean; spriteName?: string; spriteUrl?: string; error?: string }> {
  return new Promise((resolve) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'sprites_provisioner.py');
    const spriteName = `arca-${username}-${Date.now()}`;

    // Create a temporary input file for the provisioner
    const inputData = JSON.stringify({
      customer_email: email,
      skills,
      sprite_name: spriteName,
      username,
    });

    const childProcess = spawn('python3', [pythonScript, 'provision'], {
      env: {
        ...process.env,
        PROVISIONING_INPUT: inputData,
      },
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('[Provisioner]', data.toString());
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[Provisioner Error]', data.toString());
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        // Parse output to get sprite URL
        const urlMatch = stdout.match(/URL:\s*(https?:\/\/[^\s]+)/);
        const spriteUrl = urlMatch ? urlMatch[1] : `https://${spriteName}.sprites.app`;

        resolve({
          success: true,
          spriteName,
          spriteUrl,
        });
      } else {
        resolve({
          success: false,
          error: stderr || 'Provisioning failed',
        });
      }
    });

    childProcess.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}

/**
 * Save customer record to data/customers.json
 */
async function saveCustomerRecord(record: CustomerRecord): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');
  const customersFile = path.join(dataDir, 'customers.json');

  // Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  let customers: CustomerRecord[] = [];

  try {
    const existingData = await fs.readFile(customersFile, 'utf-8');
    customers = JSON.parse(existingData);
  } catch (error) {
    // File doesn't exist or is invalid, start with empty array
    console.log('Creating new customers.json file');
  }

  customers.push(record);

  await fs.writeFile(customersFile, JSON.stringify(customers, null, 2), 'utf-8');
  console.log('Customer record saved:', record.email);
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

    // Call Python provisioner to create sprite
    const provisioningResult = await callPythonProvisioner(
      request.customerEmail,
      request.skills,
      username
    );

    if (!provisioningResult.success) {
      console.error('Provisioning failed:', provisioningResult.error);
      return {
        success: false,
        error: provisioningResult.error,
      };
    }

    console.log('Sprite provisioned:', provisioningResult.spriteName);

    // Save customer record
    const customerRecord: CustomerRecord = {
      email: request.customerEmail,
      name: request.customerName,
      username,
      password,
      spriteUrl: provisioningResult.spriteUrl!,
      spriteName: provisioningResult.spriteName!,
      skills: request.skills,
      stripeCustomerId: request.stripeCustomerId,
      subscriptionId: request.subscriptionId,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    await saveCustomerRecord(customerRecord);

    return {
      success: true,
      spriteName: provisioningResult.spriteName,
      spriteUrl: provisioningResult.spriteUrl,
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
 * Get customer by email
 */
export async function getCustomerByEmail(email: string): Promise<CustomerRecord | null> {
  try {
    const customersFile = path.join(process.cwd(), 'data', 'customers.json');
    const data = await fs.readFile(customersFile, 'utf-8');
    const customers: CustomerRecord[] = JSON.parse(data);
    return customers.find(c => c.email === email) || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get customer by Stripe customer ID
 */
export async function getCustomerByStripeId(stripeCustomerId: string): Promise<CustomerRecord | null> {
  try {
    const customersFile = path.join(process.cwd(), 'data', 'customers.json');
    const data = await fs.readFile(customersFile, 'utf-8');
    const customers: CustomerRecord[] = JSON.parse(data);
    return customers.find(c => c.stripeCustomerId === stripeCustomerId) || null;
  } catch (error) {
    return null;
  }
}
