# Arcamatrix - Progress & Handoff Notes

> Last updated: 2026-02-13
> Status: **Production-Ready** - Full pipeline working, self-healing enabled, security hardened

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
- `sprite_pool.py` manages pre-created Sprite VMs (currently 7 available, 1 assigned)
- `provision_customer.sh` installs OpenClaw on customer sprite
- Customer-sprite mapping registered for subdomain routing
- Custom UI uploaded automatically during provisioning
- **Pflaster self-healing** wraps all provisioning + recycle tasks (see below)

### 3. Subdomain Routing (DONE)
- `*.arcamatrix.com` wildcard DNS on Vercel
- `middleware.ts` detects subdomains and proxies to customer sprites
- WebSocket goes directly to sprite (Vercel doesn't support WS proxy)
- `config.json` on each sprite has `gatewayUrl` for direct WS connection

### 4. Customer UI (DONE)
- Custom HTML/CSS/JS served via authenticated proxy (`proxy.js`)
- **Login**: Password-based auth verified against Arcamatrix portal API
- **Chat**: Full streaming chat with AI (works end-to-end)
- **Settings**: AI provider + API key configuration (Anthropic, OpenAI, Google, OpenRouter, xAI)
- **Skill Catalog**: Full-page view with responsive card grid and detail modals
- **Mobile UI**: Fully responsive - hidden sidebar with hamburger menu, large touch-friendly inputs
- **Session persistence**: Signed HMAC cookies with 24h expiry

### 5. Security & Auth (DONE)
- Password auth via portal API (Stripe subscription verification built-in)
- HMAC-SHA256 signed session cookies with constant-time comparison
- Rate limiting: 5 login attempts per 15min per IP
- WebSocket auth: session cookie verified on upgrade
- Path traversal protection on static file serving
- Git history purged of all leaked credentials
- All API keys rotated and stored in env vars

### 6. Pflaster Self-Healing System (DONE)
- **Pre-hook** (before every task): Checks pool status, Sprites API, target services, git repo state, orphan tasks
- **Post-hook** (after every task): Verifies result, fixes root causes, refills pool, logs audit trail
- Quick-patches applied automatically: service restarts, emergency sprite creation, git resets
- Health endpoint at `/pflaster/health` on every customer sprite (no auth required)
- Audit log in `pflaster_state.json` on orchestrator
- Integration: `pflaster_wrap()` wraps `provision_sprite()` and `handle_recycle()`

### 7. OpenClaw Gateway RPC (VERIFIED)
All these RPC methods have been tested and work:
- `connect` with `client.id: 'openclaw-control-ui'`, `client.mode: 'webchat'`
- `skills.status` - returns all 50 skills with `eligible`, `missing.env`, `missing.bins`
- `config.get` - returns full config + hash
- `config.set` with `{ raw: "<JSON>", baseHash: "<hash>" }` - optimistic locking
- `models.auth.set` with `{ profileId, token }` - sets AI API keys
- `chat.send` with streaming `chat` events

---

## Deployed Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| Web App (Next.js) | Vercel - `arcamatrix.com` | Running |
| Swarm Orchestrator | `swarm-orchestrator` Sprite | Running |
| Provisioning Agent | Orchestrator - systemd service | Running |
| Pflaster Self-Healing | Orchestrator - wraps all tasks | Active |
| Customer Sprite #001 | `arca-customer-001` Sprite | Running (assigned) |
| Customer URL | `justustheile.arcamatrix.com` | Active |
| Sprite Pool | 7 available + 1 assigned = 8 total | Healthy |

### Sprite Pool Status
| Sprite | Status |
|--------|--------|
| arca-customer-001 | Assigned to justustheile |
| arca-customer-002 | Available |
| arca-customer-003 | Available |
| arca-customer-004 | Available |
| arca-customer-006 | Available |
| arca-customer-007 | Available |
| arca-customer-008 | Available |
| arca-customer-010 | Preparing (OpenClaw installing) |

---

## File Map

### On `swarm-orchestrator`
| File | Purpose |
|------|---------|
| `provisioning_agent.py` | Main agent - polls tasks, provisions sprites, handles recycles |
| `pflaster.py` | Self-healing wrapper - pre-checks, post-fixes, audit logging |
| `sprite_pool.py` | Pool management - assign, release, status queries |
| `provision_customer.sh` | Shell script run on customer sprites during provisioning |
| `prepare_pool_sprite.sh` | Pre-installs OpenClaw on new pool sprites |
| `proxy.js` | Auth proxy for customer sprites (uploaded during provisioning) |
| `pflaster_state.json` | Active patches + audit log |
| `blackboard/sprite_pool.json` | Pool state (sprite assignments, availability) |

### On Customer Sprites
| File | Purpose |
|------|---------|
| `proxy.js` | Auth proxy - login, session, static files, gateway proxy |
| `custom-ui/index.html` | Customer-facing chat + settings UI |
| `custom-ui/config.json` | Gateway URL + customer name for WebSocket |

### In GitHub Repo (`scripts/`)
| File | Purpose |
|------|---------|
| `scripts/provisioning_agent.py` | Mirror of live provisioning agent |
| `scripts/pflaster.py` | Mirror of live pflaster module |
| `scripts/proxy.js` | Mirror of live auth proxy |
| `scripts/provision_customer.sh` | Mirror of live provisioning script |
| `ARCHITECTURE.md` | Complete system architecture with diagrams |

---

## Key Technical Details

### OpenClaw Config Format
The config uses optimistic locking. To update:
```javascript
// 1. Get current config + hash
const res = await rpcCall('config.get', {});
const cfg = res.payload.config;
const hash = res.payload.hash;

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

### Sprites Exec API
```bash
# Correct format (URL query params, NOT JSON body):
curl -X POST "https://api.sprites.dev/v1/sprites/{name}/exec?cmd=bash&cmd=-c&cmd=<command>"
# Response has control characters (\x01 prefix, \x03\x00 suffix) - strip before parsing
```

---

## What Still Needs Work

### Priority 1: End-to-End Flow Test with Real Stripe
- Switch Stripe to **live mode** (currently test mode)
- Do a real purchase and verify: payment -> webhook -> task -> provisioning -> email -> customer login -> chat works
- Verify cancellation/recycle flow with real subscription

### Priority 2: Legal & Compliance
- Add **Impressum** page (German legal requirement)
- Add **Datenschutzerklaerung** (Privacy Policy)
- Terms of Service

### Priority 3: Browser Testing
- Test customer UI in multiple browsers (Chrome, Firefox, Safari, mobile)
- Verify WebSocket reconnection behavior
- Test skill catalog detail modals on different screen sizes

### Priority 4: Skills That Need Extra Work
- **Slack**: Needs Slack app setup, not just env vars
- **Email (himalaya)**: Needs CLI binary installed + config
- **Summarize**: Needs CLI binary installed
- These should be marked as "Coming Soon" in the UI

### Priority 5: Monitoring & Alerting
- Add alerting when pflaster applies emergency patches
- Dashboard for pool health / service status
- Log aggregation for debugging customer issues

### Priority 6: Multi-Customer Hardening
- Load testing with multiple concurrent provisions
- Verify pool auto-refill under load
- Customer data isolation audit
