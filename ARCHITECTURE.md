# Arcamatrix — Complete System Architecture

## Table of Contents
- [High-Level Overview](#high-level-overview)
- [Infrastructure Map](#infrastructure-map)
- [Customer Lifecycle](#customer-lifecycle)
- [Provisioning Pipeline](#provisioning-pipeline)
- [Cancellation & Recycling](#cancellation--recycling)
- [Pflaster Self-Healing System](#pflaster-self-healing-system)
- [Subdomain Routing](#subdomain-routing)
- [Sprite Pool Management](#sprite-pool-management)
- [File Map](#file-map)
- [Service Map](#service-map)
- [Security Architecture](#security-architecture)

---

## High-Level Overview

```
                           ┌─────────────────────────────────────────────────┐
                           │                   INTERNET                      │
                           └────────┬──────────────────┬─────────────────────┘
                                    │                  │
                            ┌───────▼───────┐  ┌──────▼──────────────┐
                            │  Stripe API   │  │  Customer Browser   │
                            │  (Payments)   │  │                     │
                            └───────┬───────┘  └──────┬──────────────┘
                                    │                  │
                         webhook    │                  │  HTTPS
                         events     │                  │
                                    │                  │
┌───────────────────────────────────▼──────────────────▼──────────────────────┐
│                                                                             │
│                        Vercel  —  arcamatrix.com                            │
│                                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Landing  │  │ Checkout │  │  Webhook  │  │  Portal  │  │ Middleware │  │
│  │  Page    │  │   API    │  │  Handler  │  │   API    │  │ (Subdom.)  │  │
│  │ page.tsx │  │/checkout │  │ /webhook  │  │ /portal  │  │ *.arca..   │  │
│  └──────────┘  └──────────┘  └─────┬─────┘  └──────────┘  └──────┬─────┘  │
│                                    │                              │         │
└────────────────────────────────────┼──────────────────────────────┼─────────┘
                                     │                              │
                    Creates task     │               Rewrites to    │
                    in blackboard    │               sprite URL     │
                                     │                              │
┌────────────────────────────────────▼──────────────────────────────┼─────────┐
│                                                                   │         │
│                   swarm-orchestrator  (Sprite VM)                  │         │
│                                                                   │         │
│  ┌─────────────────────┐  ┌──────────────┐  ┌─────────────────┐  │         │
│  │ Provisioning Agent  │  │  Pflaster    │  │  Sprite Pool    │  │         │
│  │ (Python, 30s poll)  │──│  Self-Heal   │  │  (JSON + lock)  │  │         │
│  │                     │  │              │  │  7 sprites      │  │         │
│  └──────────┬──────────┘  └──────────────┘  └─────────────────┘  │         │
│             │                                                     │         │
│             │  Sprites API (create, exec, upload)                 │         │
│             │                                                     │         │
└─────────────┼─────────────────────────────────────────────────────┘         │
              │                                                               │
              ▼                                                               │
┌─────────────────────────────────────────────────────────────────────────────┘
│
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│   │  arca-customer-001   │  │  arca-customer-002   │  │  arca-customer-  │
│   │  (assigned)          │  │  (available)         │  │  003..007        │
│   │                      │  │                      │  │  (pool)          │
│   │  ┌────────────────┐  │  │  OpenClaw pre-       │  │                  │
│   │  │  proxy.js:8080 │◄─┼──┼──installed, ready    │  │                  │
│   │  │  (auth+UI+WS)  │  │  │  for assignment      │  │                  │
│   │  └───────┬────────┘  │  │                      │  │                  │
│   │          │           │  └──────────────────────┘  └──────────────────┘
│   │  ┌───────▼────────┐  │
│   │  │  OpenClaw GW   │  │
│   │  │  :3001 (AI)    │  │
│   │  └────────────────┘  │
│   │                      │
│   └──────────────────────┘
```

---

## Infrastructure Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Sprites.dev Cloud                            │
│                                                                     │
│  ┌─────────────────────────────┐                                    │
│  │   swarm-orchestrator        │  The brain. Runs provisioning,     │
│  │   (always-on)               │  self-healing, pool management.    │
│  │                             │                                    │
│  │   Services:                 │  Files:                            │
│  │   • provisioning-agent      │  • provisioning_agent.py (27KB)    │
│  │   • log-rotator             │  • pflaster.py (22KB)              │
│  │                             │  • sprite_pool.py (8KB)            │
│  │   Blackboard:               │  • proxy.js (11KB)                 │
│  │   • tasks.json              │  • provision_customer.sh (7KB)     │
│  │   • sprite_pool.json        │  • prepare_pool_sprite.sh          │
│  └─────────────────────────────┘  • run_agent.sh, rotate_logs.sh   │
│                                                                     │
│  ┌─────────────────────────────┐                                    │
│  │   arca-customer-001         │  Assigned to: justustheile         │
│  │   (customer sprite)         │  URL: justustheile.arcamatrix.com  │
│  │                             │                                    │
│  │   Services:                 │  Files:                            │
│  │   • arcamatrix-proxy (:8080)│  • proxy.js (auth + UI + WS)      │
│  │   • openclaw-gateway (:3001)│  • custom-ui/index.html            │
│  │   • log-rotator             │  • custom-ui/config.json           │
│  └─────────────────────────────┘                                    │
│                                                                     │
│  ┌───────────────────┐ ┌───────────────────┐ ┌──────────────────┐  │
│  │ arca-customer-002 │ │ arca-customer-003 │ │ arca-customer-   │  │
│  │ (available)       │ │ (available)       │ │ 004,006,007      │  │
│  │ OpenClaw pre-     │ │ OpenClaw pre-     │ │ (available)      │  │
│  │ installed         │ │ installed         │ │                  │  │
│  └───────────────────┘ └───────────────────┘ └──────────────────┘  │
│                                                                     │
│  ┌───────────────────┐                                              │
│  │ arca-customer-005 │  Status: unreachable (skipped)               │
│  └───────────────────┘                                              │
│                                                                     │
│  Total: 7 sprites | 1 assigned | 5 available | 1 unreachable       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          Vercel                                     │
│                                                                     │
│  Project: justus-projects-d3ab3881/arcamatrix                       │
│  Domain:  arcamatrix.com + *.arcamatrix.com                         │
│  Stack:   Next.js 14 (App Router)                                   │
│  Deploy:  Auto on git push to main                                  │
│                                                                     │
│  Routes:                                                            │
│  • /              → Landing page (skill catalog, pricing)           │
│  • /success       → Post-checkout page (set password)               │
│  • /api/checkout  → Creates Stripe checkout session                 │
│  • /api/webhook   → Stripe webhook (creates PROV/RECYCLE tasks)     │
│  • /api/portal    → Password verification for customer login        │
│  • /api/tasks     → Task management (read blackboard)               │
│  • /api/set-password → Customer password setup                      │
│  • /api/customer-proxy → Proxies to customer sprites                │
│  • *.arcamatrix.com → Middleware rewrites to sprite URL             │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐
│           External Services          │
│                                      │
│  • Stripe     — Payments, subs       │
│  • Resend     — Transactional email  │
│  • Linear     — Issue tracking       │
│  • GitHub     — Source (public repo) │
│  • Sprites.dev — VM infrastructure   │
└──────────────────────────────────────┘
```

---

## Customer Lifecycle

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────┐
│ Customer │────▶│  Landing  │────▶│   Stripe     │────▶│  Success │
│ visits   │     │   Page    │     │  Checkout    │     │   Page   │
│ site     │     │ (skills)  │     │  ($7/month)  │     │ (set pw) │
└──────────┘     └───────────┘     └──────┬───────┘     └──────────┘
                                          │
                                   payment success
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │ Stripe fires   │
                                  │ checkout.      │
                                  │ session.       │
                                  │ completed      │
                                  └───────┬───────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │ /api/webhook   │
                                  │                │
                                  │ 1. Verify sig  │
                                  │ 2. Idempotency │
                                  │ 3. Gen user    │
                                  │ 4. Gen token   │
                                  │ 5. Create task │
                                  │ 6. Linear tkt  │
                                  └───────┬───────┘
                                          │
                              PROV-{date}-{id} task
                              written to blackboard
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │  Provisioning Agent    │
                              │  (picks up in ≤30s)    │
                              │                        │
                              │  pflaster_pre() ──────▶│ Pre-flight checks
                              │  provision_sprite() ──▶│ Assign + configure
                              │  pflaster_post() ─────▶│ Verify + root-fix
                              └───────────┬───────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                   │ Sprite     │  │ Middleware  │  │  Welcome   │
                   │ configured │  │ mapping    │  │  Email     │
                   │ (UI+proxy  │  │ added      │  │  sent via  │
                   │  +gateway) │  │ (git push) │  │  Resend    │
                   └────────────┘  └────────────┘  └────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │  Customer accesses     │
                              │  username.arcamatrix   │
                              │  .com                  │
                              │                        │
                              │  Login → Chat with AI  │
                              └───────────────────────┘
```

---

## Provisioning Pipeline

```
  provision_sprite(task_id, task_data)
  ═══════════════════════════════════

  1. ASSIGN SPRITE
     ┌──────────────────┐
     │  SpritePool       │
     │  .assign_sprite() │──▶ Picks first "available" sprite
     │                   │    Marks as "assigned" with username
     └──────────────────┘

  2. UPLOAD FILES
     ┌──────────────────┐
     │  Sprites FS API   │
     │  PUT /fs/write    │──▶ provision_customer.sh
     │                   │──▶ custom-ui/index.html
     │                   │──▶ proxy.js
     └──────────────────┘

  3. RUN PROVISION SCRIPT
     ┌──────────────────────────────────────────┐
     │  bash provision_customer.sh               │
     │                                           │
     │  • Write config.json (email, skills)      │
     │  • Configure OpenClaw gateway token       │
     │  • Register sprite-env services:          │
     │    - openclaw-gateway (:3001)              │
     │    - arcamatrix-proxy (:8080)              │
     │  • Start all services                     │
     └──────────────────────────────────────────┘

  4. UPDATE MIDDLEWARE
     ┌──────────────────────────────────────────┐
     │  Git Operations (on orchestrator)         │
     │                                           │
     │  • git pull --rebase                      │
     │  • Add to customerMappings in             │
     │    src/middleware.ts                       │
     │  • git commit + push                      │
     │  • Vercel auto-deploys (subdomain live)   │
     └──────────────────────────────────────────┘

  5. REGISTER API MAPPING (backup)
     POST /api/customer-proxy { username, spriteUrl }

  6. SEND WELCOME EMAIL
     ┌──────────────────────────────────────────┐
     │  Resend API                               │
     │                                           │
     │  To: customer email                       │
     │  Subject: Your Arcamatrix AI Workspace    │
     │  Contains: URL, login instructions        │
     │  Retries: 3x with backoff                 │
     └──────────────────────────────────────────┘

  7. CHECK POOL HEALTH
     If available < 3 → expand_pool() creates new sprites
```

---

## Cancellation & Recycling

```
  Stripe fires customer.subscription.deleted
                    │
                    ▼
            ┌───────────────┐
            │  /api/webhook  │
            │                │
            │  1. Find user  │ ◄── Search tasks.json by subscriptionId
            │  2. Create     │
            │     RECYCLE-*  │
            │     task       │
            │  3. Linear tkt │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────────────┐
            │  handle_recycle()      │
            │                       │
            │  1. Remove middleware  │ ◄── git push → Vercel redeploy
            │     mapping (instant   │     Customer sees "not found"
            │     access block)      │
            │                       │
            │  2. Remove API mapping │
            │                       │
            │  3. Stop services     │ ◄── openclaw-gateway + proxy
            │                       │
            │  4. Clean data        │ ◄── configs, UI, workspaces
            │     (keep OpenClaw)   │
            │                       │
            │  5. Release sprite    │ ◄── Back to pool as "available"
            │     to pool           │
            └───────────────────────┘
```

---

## Pflaster Self-Healing System

The Pflaster-Prinzip ("band-aid principle") wraps every provisioning and recycling task with automated diagnosis, patching, and permanent root-cause fixing.

```
    Customer signs up / cancels
                │
                ▼
    ┌───────────────────────────────────────────────┐
    │              pflaster_wrap()                    │
    │                                                │
    │  ┌─────────────────────────────────────────┐   │
    │  │         PRE-HOOK: pflaster_pre()         │   │
    │  │                                          │   │
    │  │  "Is the system healthy enough to        │   │
    │  │   execute this task?"                    │   │
    │  │                                          │   │
    │  │  ┌────────────────┐  ┌────────────────┐  │   │
    │  │  │ CHECK          │  │ QUICK PATCH    │  │   │
    │  │  │                │  │ (if unhealthy) │  │   │
    │  │  │ 1. Sprites API │  │                │  │   │
    │  │  │    reachable?  │──│ Wait + retry   │  │   │
    │  │  │                │  │ (3x backoff)   │  │   │
    │  │  │ 2. Pool has    │  │                │  │   │
    │  │  │    sprites?    │──│ Emergency:     │  │   │
    │  │  │                │  │ create 1       │  │   │
    │  │  │ 3. Git repo    │  │                │  │   │
    │  │  │    clean?      │──│ git reset      │  │   │
    │  │  │                │  │ --hard origin   │  │   │
    │  │  │ 4. Stale tasks │  │                │  │   │
    │  │  │    stuck?      │──│ Reset to       │  │   │
    │  │  │                │  │ "failed"       │  │   │
    │  │  │ 5. Target svc  │  │                │  │   │
    │  │  │    healthy?    │──│ (log for       │  │   │
    │  │  │    (/pflaster/ │  │  post-fix)     │  │   │
    │  │  │     health)    │  │                │  │   │
    │  │  └────────────────┘  └────────────────┘  │   │
    │  │                                          │   │
    │  │  Patches recorded → pflaster_state.json  │   │
    │  └─────────────────────────────────────────┘   │
    │                    │                            │
    │                    ▼                            │
    │  ┌─────────────────────────────────────────┐   │
    │  │              TASK EXECUTION               │   │
    │  │                                           │   │
    │  │  provision_sprite() or handle_recycle()   │   │
    │  │  Runs in guaranteed healthy environment   │   │
    │  └─────────────────────────────────────────┘   │
    │                    │                            │
    │                    ▼                            │
    │  ┌─────────────────────────────────────────┐   │
    │  │        POST-HOOK: pflaster_post()        │   │
    │  │                                          │   │
    │  │  "Did it work? Fix the root cause.       │   │
    │  │   Remove the band-aid."                  │   │
    │  │                                          │   │
    │  │  ┌─────────────────┐ ┌────────────────┐  │   │
    │  │  │ VERIFY RESULT   │ │ ROOT-CAUSE FIX │  │   │
    │  │  │                 │ │                │  │   │
    │  │  │ • Services up?  │ │ Pool empty?    │  │   │
    │  │  │   (/pflaster/   │ │ → Expand to 5  │  │   │
    │  │  │    health)      │ │                │  │   │
    │  │  │                 │ │ Service crash? │  │   │
    │  │  │ • Mapping       │ │ → Install      │  │   │
    │  │  │   registered?   │ │   crontab      │  │   │
    │  │  │                 │ │   watchdog     │  │   │
    │  │  │ • Email sent?   │ │                │  │   │
    │  │  │                 │ │ Git dirty?     │  │   │
    │  │  │ • Pool ≥ 3?    │ │ → Log for      │  │   │
    │  │  │                 │ │   investigation│  │   │
    │  │  └─────────────────┘ └────────────────┘  │   │
    │  │                                          │   │
    │  │  Fixes recorded → pflaster_state.json    │   │
    │  └─────────────────────────────────────────┘   │
    │                                                │
    └───────────────────────────────────────────────┘

  Key: Patches are TEMPORARY (applied before task).
       Root-cause fixes are PERMANENT (applied after task).
       The band-aid is removed once the real fix is in place.
```

### Pflaster Audit Trail

Every pre-check and post-fix is logged to `/home/sprite/pflaster_state.json`:

```json
{
  "patches": [],
  "log": [
    {
      "task_id": "PROV-20260214-a1b2c3d4",
      "phase": "pre",
      "timestamp": "2026-02-14T15:45:28Z",
      "entries": []
    },
    {
      "task_id": "PROV-20260214-a1b2c3d4",
      "phase": "post",
      "timestamp": "2026-02-14T15:46:02Z",
      "entries": [
        { "type": "pool_refill", "fix": "pool expanded (was 2)" }
      ]
    }
  ]
}
```

---

## Subdomain Routing

```
  Customer visits: https://justustheile.arcamatrix.com
                          │
                          ▼
              ┌───────────────────────┐
              │  Vercel Edge          │
              │  middleware.ts        │
              │                       │
              │  1. Extract hostname  │
              │  2. Parse username    │
              │  3. Validate format   │
              │     [a-z0-9-]{1,32}   │
              │  4. Lookup in         │
              │     customerMappings  │
              │  5. NextResponse      │
              │     .rewrite(spriteUrl│
              │     + path)           │
              └───────────┬───────────┘
                          │
              rewrite to sprite URL
              (browser still shows
               username.arcamatrix.com)
                          │
                          ▼
              ┌───────────────────────┐
              │  arca-customer-001    │
              │  :8080 (proxy.js)     │
              │                       │
              │  /auth/login    → Auth│
              │  /auth/logout   → Clear│
              │  /pflaster/health→JSON│
              │  /index.html   → UI  │
              │  /ws            → WS  │
              │  /*             → GW  │
              └───────────────────────┘

  Mapping source (middleware.ts):
  ┌───────────────────────────────────────────────────┐
  │ const customerMappings = {                         │
  │   'justustheile': 'https://arca-customer-001-...' │
  │ };                                                 │
  └───────────────────────────────────────────────────┘
  Updated via git push by provisioning agent.
  Vercel auto-deploys on push → mapping goes live.
```

---

## Sprite Pool Management

```
  ┌────────────────────────────────────────────────────┐
  │            sprite_pool.json                         │
  │                                                     │
  │  arca-customer-001  ████████  assigned (justustheile)
  │  arca-customer-002  ░░░░░░░░  available              │
  │  arca-customer-003  ░░░░░░░░  available              │
  │  arca-customer-004  ░░░░░░░░  available              │
  │  arca-customer-005  xxxxxxxx  unreachable            │
  │  arca-customer-006  ░░░░░░░░  available              │
  │  arca-customer-007  ░░░░░░░░  available              │
  │                                                     │
  │  ████ = assigned    ░░░░ = available    xxxx = down  │
  └────────────────────────────────────────────────────┘

  Pool rules:
  • Min available: 3 (expand if fewer)
  • Expand count: 3 at a time
  • Pre-install: OpenClaw on every pool sprite
  • Health check: every 5 minutes (auto-restart services)
  • Unreachable: try recover on each health check

  Lifecycle:
  ┌──────────┐   assign    ┌──────────┐   release   ┌──────────┐
  │ available │────────────▶│ assigned │────────────▶│ available │
  └──────────┘              └──────────┘   (recycle) └──────────┘
       │                         │
       │  create + prepare       │  mark_unreachable
       │                         │
  ┌────▼─────┐              ┌────▼───────┐
  │  (new)   │              │unreachable │
  └──────────┘              └────────────┘
```

---

## File Map

### Vercel Web App (`src/`)

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Subdomain routing: `username.arcamatrix.com` → sprite URL |
| `src/app/page.tsx` | Landing page with skill catalog and pricing |
| `src/app/success/page.tsx` | Post-checkout: set password flow |
| `src/app/api/checkout/route.ts` | Creates Stripe checkout session ($7/month) |
| `src/app/api/webhook/route.ts` | Stripe webhook → creates PROV/RECYCLE tasks |
| `src/app/api/portal/route.ts` | Password verification for customer login |
| `src/app/api/set-password/route.ts` | Customer sets password after checkout |
| `src/app/api/tasks/route.ts` | Task management API (read blackboard) |
| `src/app/api/customer-proxy/route.ts` | Proxies requests to customer sprites |
| `src/lib/tasks.ts` | Task CRUD via Sprites filesystem API |
| `src/lib/skills.ts` | Skill definitions and catalog data |
| `src/lib/password.ts` | Argon2-style password hashing |
| `src/components/*.tsx` | UI components (Hero, Features, SkillSelector, etc.) |

### Orchestrator (`swarm-orchestrator:/home/sprite/`)

| File | Size | Purpose |
|------|------|---------|
| `provisioning_agent.py` | 27KB | Main agent: poll tasks, provision, recycle, health checks |
| `pflaster.py` | 22KB | Self-healing: pre-checks, post-fixes, audit logging |
| `sprite_pool.py` | 8KB | Pool manager: assign, release, heal, expand |
| `proxy.js` | 11KB | Customer proxy template (copied to sprites) |
| `provision_customer.sh` | 7KB | Shell script: configures a sprite for a customer |
| `prepare_pool_sprite.sh` | 1KB | Shell script: pre-installs OpenClaw on pool sprite |
| `run_agent.sh` | 1KB | Service wrapper: starts provisioning_agent.py |
| `rotate_logs.sh` | 1KB | Log rotation cron |
| `blackboard/tasks.json` | ~7KB | Task queue (PROV-*, RECYCLE-*) |
| `blackboard/sprite_pool.json` | ~2KB | Pool state (7 sprites) |
| `pflaster_state.json` | dynamic | Pflaster audit log (last 200 entries) |

### Customer Sprite (`arca-customer-NNN:/home/sprite/`)

| File | Purpose |
|------|---------|
| `proxy.js` | Auth proxy: login, session, UI serving, WS proxy, health endpoint |
| `custom-ui/index.html` | Chat interface (skills, sidebar, settings) |
| `custom-ui/config.json` | Customer config (email, skills, token) |
| `run_proxy.sh` | Service wrapper for proxy.js |
| `start-gateway.sh` | Service wrapper for OpenClaw gateway |

---

## Service Map

### swarm-orchestrator

| Service | Command | Purpose |
|---------|---------|---------|
| `provisioning-agent` | `bash run_agent.sh` | Polls tasks every 30s, provisions/recycles |
| `log-rotator` | `bash rotate_logs.sh` | Rotates logs to prevent disk fill |

### arca-customer-NNN (each customer sprite)

| Service | Port | Purpose |
|---------|------|---------|
| `arcamatrix-proxy` | 8080 | Auth + UI + WebSocket proxy (public) |
| `openclaw-gateway` | 3001 | AI chat backend (internal only) |
| `log-rotator` | — | Log rotation |

---

## Security Architecture

```
  ┌────────────────────────────────────────────────────────────┐
  │                     Security Layers                         │
  │                                                             │
  │  LAYER 1: STRIPE WEBHOOK VERIFICATION                      │
  │  ├─ HMAC-SHA256 signature verification                     │
  │  ├─ Timestamp tolerance (5 min max)                        │
  │  ├─ Constant-time comparison (prevent timing attacks)      │
  │  └─ Idempotency check (reject duplicate events)            │
  │                                                             │
  │  LAYER 2: CUSTOMER AUTHENTICATION                          │
  │  ├─ Password hashed server-side (set-password API)         │
  │  ├─ Portal API verifies password + checks Stripe sub       │
  │  ├─ Signed session cookie (HMAC-SHA256)                    │
  │  ├─ HttpOnly + Secure + SameSite=Strict flags              │
  │  └─ Rate limiting (5 attempts / 15 min per IP)             │
  │                                                             │
  │  LAYER 3: INPUT VALIDATION                                 │
  │  ├─ Username regex: [a-z0-9][a-z0-9-]{0,30}[a-z0-9]      │
  │  ├─ Skill IDs validated against whitelist                  │
  │  ├─ XSS prevention: escapeHtml on all dynamic content      │
  │  ├─ URL validation: reject javascript: protocol            │
  │  └─ Path traversal prevention in proxy.js                  │
  │                                                             │
  │  LAYER 4: INFRASTRUCTURE                                   │
  │  ├─ Admin API key for orchestrator ↔ web app               │
  │  ├─ Sprites API token for VM management                    │
  │  ├─ No secrets in git history (purged with git-filter-repo)│
  │  ├─ Env vars for all sensitive config                      │
  │  └─ WebSocket auth: session required for upgrade           │
  │                                                             │
  │  LAYER 5: SELF-HEALING (Pflaster)                          │
  │  ├─ Pre-task health verification                           │
  │  ├─ Stale task cleanup (60 min timeout)                    │
  │  ├─ Auto-restart crashed services                          │
  │  ├─ Watchdog crontab installation (permanent fix)          │
  │  └─ Full audit trail in pflaster_state.json                │
  └────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

```
  Stripe ──webhook──▶ Vercel ──task──▶ Orchestrator ──provision──▶ Customer Sprite
                        │                    │                          │
                        │                    │  pflaster               │
                        │                    │  pre/post               │
                        │                    │                          │
                        │◀──git push────────│                          │
                        │  (middleware.ts)    │                          │
                        │                    │                          │
  Customer ──HTTPS──▶ Vercel ──rewrite──▶ Customer Sprite             │
  Browser               │                   :8080 proxy.js             │
                        │                      │                       │
                        │                      ▼                       │
                        │                   :3001 OpenClaw             │
                        │                   (AI responses)             │
                        │                                              │
  Resend ◀──email──── Orchestrator                                    │
  (welcome)              │                                              │
                         │◀──health check (every 5 min)───────────────│
```

---

*Last updated: 2026-02-14 | Generated from live system inspection*
