import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WelcomeEmailData {
  customerEmail: string;
  customerName: string;
  username: string;
  password: string;
  spriteUrl: string;
  skills: string[];
}

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  try {
    const skillsList = data.skills.map(skill => `• ${skill}`).join('\n');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .credentials-box {
      background: white;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .credential-row {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 10px;
      background: #f3f4f6;
      border-radius: 5px;
    }
    .credential-label {
      font-weight: bold;
      color: #667eea;
    }
    .credential-value {
      font-family: 'Courier New', monospace;
      color: #1f2937;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 30px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      margin: 20px 0;
    }
    .skills-list {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      color: #6b7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Welcome to Arcamatrix!</h1>
  </div>

  <div class="content">
    <p>Hi ${data.customerName},</p>

    <p>Your personal AI workspace is ready! We've set up your dedicated Sprite VM with all the skills you selected.</p>

    <div class="credentials-box">
      <h3 style="margin-top: 0; color: #667eea;">Your Login Credentials</h3>
      <div class="credential-row">
        <span class="credential-label">Workspace URL:</span>
        <span class="credential-value">${data.spriteUrl}</span>
      </div>
      <div class="credential-row">
        <span class="credential-label">Username:</span>
        <span class="credential-value">${data.username}</span>
      </div>
      <div class="credential-row">
        <span class="credential-label">Password:</span>
        <span class="credential-value">${data.password}</span>
      </div>
      <p style="margin-top: 15px; color: #6b7280; font-size: 14px;">
        ⚠️ Please save these credentials securely. You can change your password after logging in.
      </p>
    </div>

    <div class="skills-list">
      <h3 style="margin-top: 0; color: #667eea;">Your Active Skills</h3>
      <pre style="margin: 0; white-space: pre-wrap; color: #1f2937;">${skillsList}</pre>
    </div>

    <div style="text-align: center;">
      <a href="${data.spriteUrl}" class="cta-button">Open Your Workspace</a>
    </div>

    <h3 style="color: #667eea;">Getting Started</h3>
    <ol style="color: #4b5563;">
      <li>Click the button above to access your workspace</li>
      <li>Log in with your credentials</li>
      <li>Start chatting with your AI assistant</li>
      <li>Your assistant can access all the skills you've selected</li>
    </ol>

    <p>Need help? Reply to this email or visit our support portal.</p>

    <p style="margin-top: 30px;">
      Best regards,<br>
      <strong>The Arcamatrix Team</strong>
    </p>
  </div>

  <div class="footer">
    <p>© 2026 Arcamatrix. All rights reserved.</p>
    <p>You're receiving this email because you signed up for Arcamatrix.</p>
  </div>
</body>
</html>
    `.trim();

    const result = await resend.emails.send({
      from: 'Arcamatrix <onboarding@arcamatrix.com>',
      to: [data.customerEmail],
      subject: '🎉 Your Arcamatrix AI Workspace is Ready!',
      html: emailHtml,
    });

    console.log('Welcome email sent:', result);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error: String(error) };
  }
}

export async function sendProvisioningFailureEmail(customerEmail: string, customerName: string) {
  try {
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #ef4444;
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Setup Issue</h1>
  </div>

  <div class="content">
    <p>Hi ${customerName},</p>

    <p>We encountered an issue while setting up your Arcamatrix workspace. Our team has been notified and is working to resolve this.</p>

    <p>We'll have your workspace ready within 24 hours and will send you another email with your login credentials.</p>

    <p>We apologize for any inconvenience.</p>

    <p>
      Best regards,<br>
      <strong>The Arcamatrix Team</strong>
    </p>
  </div>
</body>
</html>
    `.trim();

    await resend.emails.send({
      from: 'Arcamatrix <support@arcamatrix.com>',
      to: [customerEmail],
      subject: 'Arcamatrix Setup - Action Required',
      html: emailHtml,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send failure email:', error);
    return { success: false, error: String(error) };
  }
}
