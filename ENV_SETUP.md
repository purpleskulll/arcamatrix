# Environment Variables Setup

This document describes the environment variables needed for Arcamatrix to function properly.

## Current Status

✅ **STRIPE_SECRET_KEY** - Configured (test key)
⚠️  **STRIPE_WEBHOOK_SECRET** - NEEDS CONFIGURATION
✅ **LINEAR_API_KEY** - Configured
✅ **LINEAR_TEAM_ID** - Configured
✅ **NEXT_PUBLIC_URL** - Configured
⚠️  **ANTHROPIC_API_KEY** - OPTIONAL (currently not used)

## Required Configuration

### STRIPE_WEBHOOK_SECRET
**Status:** PLACEHOLDER - Must be configured for webhook verification

**How to get it:**
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://arcamatrix.com/api/webhook`
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
4. Copy the signing secret (starts with `whsec_`)
5. Update `.env.local` with: `STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret`

**Impact if not configured:**
- Webhook signature verification will fail
- Provisioning tickets will not be created in Linear
- Subscription events will not be processed

## Optional Configuration

### ANTHROPIC_API_KEY
**Status:** OPTIONAL - Not currently used

**Current behavior:**
- `/api/chat` route uses an echo response
- No actual AI processing happens

**How to configure (if needed in future):**
1. Get API key from console.anthropic.com
2. Update `.env.local` with: `ANTHROPIC_API_KEY=sk-ant-your_actual_key`

## Testing

All API endpoints are currently functional:
- ✅ POST /api/chat - Returns echo response
- ✅ POST /api/checkout - Creates Stripe checkout session
- ✅ POST /api/webhook - Accepts webhooks (signature verification needs STRIPE_WEBHOOK_SECRET)
- ✅ GET /api/customer - Returns customer data or 404
- ✅ POST /api/auth - Generates demo tokens

All pages load successfully:
- ✅ / (landing page)
- ✅ /dashboard (with token parameter)
- ✅ /success

## File Locations

- Environment variables: `/home/sprite/arcamatrix/.env.local`
- Customer data: `/home/sprite/arcamatrix/data/customers.json`
- Build output: `/home/sprite/arcamatrix/.next/`
