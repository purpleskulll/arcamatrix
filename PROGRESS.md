# Arcamatrix - Progress & Handoff Notes

> Last updated: 2026-02-12
> Status: **In Progress** - Core platform functional, skill catalog UI just rebuilt

---

## What Has Been Built

### 1. Landing Page & Checkout (DONE)
- Next.js app on Vercel at `arcamatrix.com`
- Stripe Checkout integration with plan selection
- Skill selector during checkout (Weather, Web Search, GitHub, etc.)
- Welcome email via Resend with gateway token and login URL

### 2. Provisioning Pipeline (DONE)
- Swarm orchestrator on `swarm-orchestrator` Sprite VM
- `provisioning_agent.py` polls `/api/tasks` for `PROV-*` tasks every 30s
- `sprite_pool.py` manages pre-created Sprite VMs
- `provision_customer.sh` installs OpenClaw on customer sprite
- Customer-sprite mapping registered for subdomain routing
- Custom UI uploaded automatically during provisioning

### 3. Subdomain Routing (DONE)
- `*.arcamatrix.com` wildcard DNS on Vercel
- `middleware.ts` detects subdomains and proxies to customer sprites
- WebSocket goes directly to sprite (Vercel doesn't support WS proxy)
- `config.json` on each sprite has `gatewayUrl` for direct WS connection

### 4. Customer UI (IN PROGRESS - just rebuilt)
- Single HTML file served by OpenClaw Gateway
- **Login**: Token-based authentication via WebSocket RPC
- **Chat**: Full streaming chat with AI (works end-to-end)
- **Settings**: AI provider + API key configuration (Anthropic, OpenAI, Google, OpenRouter, xAI)
- **Skill Catalog**: Just rebuilt as full-page view (was a broken modal before)
- **Skill Detail Modal**: Per-skill configuration popup with credential inputs

### 5. OpenClaw Gateway RPC (VERIFIED)
All these RPC methods have been tested and work:
- `connect` with `client.id: 'openclaw-control-ui'`, `client.mode: 'webchat'`
- `skills.status` - returns all 50 skills with `eligible`, `missing.env`, `missing.bins`
- `config.get` - returns full config + hash
- `config.set` with `{ raw: "<JSON>", baseHash: "<hash>" }` - optimistic locking
- `models.auth.set` with `{ profileId, token }` - sets AI API keys
- `chat.send` with streaming `chat` events

---

## What Was Just Done (Latest Session)

### Skill Catalog UI Rebuild
The old skill catalog was a popup modal that couldn't scroll and was unusable. It was rebuilt as:

1. **Full-page Skills view** - Separate view alongside Chat, switchable via sidebar navigation buttons
2. **Skills grid** - Responsive card grid showing all 10 curated skills with status badges (Active / Needs Credentials / Not Installed / Unavailable)
3. **Skill Detail Modal** - Click a skill card to open a configuration modal with:
   - About section (description)
   - Setup instructions
   - Credential input fields (e.g., `TRELLO_API_KEY`, `NOTION_API_KEY`)
   - Hints per field
   - Links to get API keys (e.g., "Create Notion Integration")
   - "Save & Activate" button that saves via `config.set` RPC
4. **Sidebar redesign** - Navigation (Chat/Skills), active skills summary with green dots
5. **File deployed to**: `arca-customer-001:/home/sprite/custom-ui/index.html` and `swarm-orchestrator:/home/sprite/arcamatrix-ui.html`

### Key Fix: Gateway Service Recreation
- Had issues with phantom `arcamatrix` service blocking HTTP port
- Resolved by timing service deletions and using correct `--args` format (comma-separated)
- Gateway now running: `openclaw gateway run --port 8080 --bind lan --token customer-001-token`

---

## What Still Needs Work

### Priority 1: Test the New Skill Catalog UI
- The rebuilt UI was just uploaded but NOT yet tested by the user in the browser
- Need to verify: full-page skills view loads, skill cards are clickable, detail modal opens, credential inputs work, save actually persists and skill becomes active
- Known concern: the previous modal couldn't scroll - need to confirm the full-page view fixes this

### Priority 2: Provision Script Improvements
- `provision_customer.sh` is basic - it doesn't yet:
  - Install skills selected at checkout (the case statement for skill installation was discussed but may not be in the deployed version)
  - Generate `config.json` with `gatewayUrl` for each customer
  - Set `gateway.controlUi.allowedOrigins` for cross-origin WebSocket
  - These were added in an earlier version but the currently deployed script may be the simpler one
- Need to verify the script on swarm-orchestrator matches what's needed

### Priority 3: End-to-End Provisioning Test
- Create a real test purchase through Stripe checkout
- Verify the full flow: payment -> task created -> agent provisions -> email sent -> customer can log in and use

### Priority 4: Skills That Need Extra Work
- **Slack**: Needs Slack app setup, not just env vars
- **Email (himalaya)**: Needs CLI binary installed + config
- **Summarize**: Needs CLI binary installed
- These should probably be marked as "Coming Soon" in the UI for now

### Priority 5: Production Hardening
- Replace `***REDACTED_ADMIN_KEY***` with a real secret
- Replace `customer-001-token` pattern with unique per-customer tokens (already generates random tokens in provision script)
- Add HTTPS certificate handling (handled by Sprites automatically)
- Rate limiting on API endpoints
- Error monitoring / logging

---

## Key Technical Details for Next Developer

### OpenClaw Config Format
The config uses optimistic locking. To update:
```javascript
// 1. Get current config + hash
const res = await rpcCall('config.get', {});
const cfg = res.payload.config;  // object
const hash = res.payload.hash;   // string

// 2. Modify config
cfg.env = cfg.env || {};
cfg.env.NOTION_API_KEY = 'user-entered-value';

// 3. Save with hash (fails if config changed since get)
await rpcCall('config.set', { raw: JSON.stringify(cfg), baseHash: hash });
```

### WebSocket Connection
```javascript
// Must use these exact values or gateway rejects:
client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'webchat' }
role: 'operator'
scopes: ['operator.admin', 'operator.approvals', 'operator.pairing']
```

### Sprite Service Management
```bash
# Create with comma-separated args (NOT space-separated in --args)
sprite-env services create name --cmd /path/to/binary --args "arg1,arg2,--flag,value" --http-port 8080

# Only ONE service can have --http-port at a time
# Delete + wait before recreating with different HTTP port
```

### Cross-Origin WebSocket
The customer UI at `username.arcamatrix.com` (served by Vercel) connects WebSocket directly to the sprite URL. The gateway must have the customer's subdomain in `allowedOrigins`:
```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["https://username.arcamatrix.com", "https://arcamatrix.com", "https://sprite-url.sprites.app"]
    }
  }
}
```

---

## Deployed Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| Web App (Next.js) | Vercel - `arcamatrix.com` | Running |
| Swarm Orchestrator | `swarm-orchestrator` Sprite | Running |
| Customer Sprite #001 | `arca-customer-001` Sprite | Running |
| OpenClaw Gateway | Port 8080 on customer sprite | Running |
| Customer URL | `justustheile.arcamatrix.com` | Active |
| Direct Sprite URL | `arca-customer-001-bl4yi.sprites.app` | Active |

## Credentials (for dev/test)

These are in the provisioning agent and API routes - stored as env vars in production:
- **Sprites API Token**: In `provisioning_agent.py` (line 21)
- **Stripe Keys**: In Vercel env vars
- **Resend API Key**: In Vercel env vars
- **Admin API Key**: `***REDACTED_ADMIN_KEY***` (needs to be changed for production)
- **Customer Gateway Token**: `customer-001-token` (test customer)
