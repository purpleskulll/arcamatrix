# Arcamatrix

Fully automated AI-as-a-Service platform. Customers pay via Stripe, get their own isolated AI assistant (powered by [OpenClaw](https://github.com/nichochar/openclaw)) running on a dedicated [Sprite VM](https://sprites.dev), with a custom-branded web UI.

## Architecture

```
Customer Browser
       |
       v
  Vercel (Next.js)           <-- Landing page, Stripe checkout, API routes
       |
       v
  Stripe Webhooks             <-- Payment events trigger provisioning
       |
       v
  Swarm Orchestrator (Sprite) <-- Polls for tasks, manages sprite pool
       |
       v
  Customer Sprite (Sprite VM) <-- Dedicated VM with OpenClaw + custom UI
       |
       v
  OpenClaw Gateway            <-- WebSocket RPC, serves custom control UI
```

### How It Works

1. Customer visits `arcamatrix.com`, selects a plan and skills
2. Stripe processes the payment
3. Webhook creates a `PROV-*` task via the API
4. The **Provisioning Agent** (running on `swarm-orchestrator`) picks up the task
5. Agent assigns a pre-created Sprite VM from the pool
6. Agent uploads the custom UI and provisioning script to the sprite
7. Script installs OpenClaw, configures the gateway, and starts the service
8. Customer gets an email with their URL (`username.arcamatrix.com`) and gateway token
9. Customer logs in and can chat with their AI, configure skills, and enter API keys

## Repository Structure

```
arcamatrix/
├── src/                         # Next.js web application (Vercel)
│   ├── app/
│   │   ├── api/
│   │   │   ├── checkout/        # Stripe checkout session creation
│   │   │   ├── webhook/         # Stripe webhook handler
│   │   │   ├── tasks/           # Task queue API (provisioning tasks)
│   │   │   ├── customer-proxy/  # Dynamic subdomain routing
│   │   │   ├── customer/        # Customer data API
│   │   │   ├── auth/            # Authentication
│   │   │   ├── chat/            # Chat proxy
│   │   │   ├── session/         # Session management
│   │   │   └── test-email/      # Email testing endpoint
│   │   ├── dashboard/           # Admin dashboard
│   │   ├── success/             # Post-checkout success page
│   │   └── [username]/          # Dynamic subdomain proxy route
│   ├── components/              # React components
│   │   ├── ChatInterface.tsx    # Chat UI component
│   │   ├── Hero.tsx             # Landing page hero
│   │   ├── Features.tsx         # Features section
│   │   ├── PricingSummary.tsx   # Pricing display
│   │   └── SkillSelector.tsx    # Skill selection during checkout
│   └── lib/
│       ├── email.ts             # Resend email integration
│       ├── provision.ts         # Provisioning task creation
│       └── tasks.ts             # Task queue helpers
├── provisioning/                # Swarm orchestrator scripts
│   ├── provisioning_agent.py    # Main agent - polls tasks, provisions sprites
│   ├── provision_customer.sh    # Shell script run on each customer sprite
│   ├── sprite_pool.py           # Sprite VM pool management
│   ├── recycle_sprite.py        # Sprite cleanup/recycling
│   └── provision_service.py     # Legacy provision service
├── customer-ui/                 # Custom OpenClaw control UI
│   ├── index.html               # Single-page app served by OpenClaw gateway
│   └── config.example.json      # Example customer config
├── config/
│   └── safety_rules.json        # AI safety/content rules
├── scripts/                     # Utility scripts
├── middleware.ts                 # Next.js middleware (subdomain routing)
└── data/                        # Runtime data (not committed)
    └── customers.json           # Customer registry
```

## Components

### 1. Web Application (`src/`)

Next.js app deployed on Vercel. Handles:
- Landing page with pricing and skill selection
- Stripe Checkout integration
- Webhook processing (creates provisioning tasks)
- Dynamic subdomain routing (`username.arcamatrix.com` -> customer's sprite)
- Admin dashboard
- Welcome email via Resend

### 2. Provisioning Agent (`provisioning/`)

Python agent running on the `swarm-orchestrator` Sprite VM:
- **`provisioning_agent.py`** - Main loop: polls `/api/tasks` for pending `PROV-*` tasks, assigns sprites from the pool, uploads scripts, runs provisioning
- **`provision_customer.sh`** - Runs on each customer sprite: installs OpenClaw, configures the gateway, sets up skills, registers as persistent service
- **`sprite_pool.py`** - Manages a pool of pre-created Sprite VMs for fast provisioning
- **`recycle_sprite.py`** - Cleans up cancelled/expired customer sprites and returns them to the pool

### 3. Customer UI (`customer-ui/`)

Custom single-page web UI that replaces OpenClaw's default control interface:
- Login screen with gateway token authentication
- Chat interface with streaming responses
- **Skill Catalog** - Full-page view showing all available skills with status badges
- **Skill Detail Modal** - Per-skill configuration with credential inputs and setup instructions
- **Settings** - AI provider selection (Anthropic, OpenAI, Google, OpenRouter, xAI) with API key input
- Sidebar with navigation (Chat/Skills), active skills list, and connection status
- Dark theme, responsive design

All skill configuration happens via OpenClaw Gateway WebSocket RPC:
- `skills.status` - Get all skills with requirements and eligibility
- `config.get` / `config.set` - Read/write config including env vars (API keys)
- `models.auth.set` - Set AI provider API keys
- `chat.send` - Send chat messages with streaming responses

### 4. OpenClaw Gateway

Each customer gets an OpenClaw Gateway instance running as a persistent Sprite service:
- Serves the custom UI from `/home/sprite/custom-ui/`
- Provides WebSocket RPC for chat, config, and skill management
- Token-based authentication
- Supports cross-origin connections (for `username.arcamatrix.com` subdomain)

## Supported Skills

| Skill | Status | Requires |
|-------|--------|----------|
| Weather | Ready | Nothing |
| Web Search (DuckDuckGo) | Ready | Nothing |
| GitHub | Ready | Pre-configured |
| Coding Agent | Ready | AI model configured |
| Gemini CLI | Ready | Nothing |
| Trello | Configurable | `TRELLO_API_KEY`, `TRELLO_TOKEN` |
| Notion | Configurable | `NOTION_API_KEY` |
| Slack | Requires setup | Slack app config |
| Email (IMAP) | Requires setup | himalaya CLI |
| Summarize | Requires setup | summarize CLI |

## Environment Variables

### Vercel (Next.js)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ADMIN_API_KEY=***REDACTED_ADMIN_KEY***
NEXT_PUBLIC_APP_URL=https://arcamatrix.com
```

### Swarm Orchestrator

```
SPRITES_TOKEN=<sprites-api-token>
ARCAMATRIX_API_BASE=https://arcamatrix.com/api
ADMIN_API_KEY=***REDACTED_ADMIN_KEY***
```

## Deployment

### Vercel

The Next.js app is deployed on Vercel with:
- Custom domain: `arcamatrix.com`
- Wildcard subdomain: `*.arcamatrix.com`
- Middleware handles routing subdomains to customer sprites

### Swarm Orchestrator

Runs on a dedicated Sprite VM (`swarm-orchestrator`):
```bash
# The provisioning agent runs as a persistent service
sprite-env services create provisioning-agent \
  --cmd python3 --args provisioning_agent.py \
  --dir /home/sprite
```

### Customer Sprites

Automatically provisioned by the agent. Each sprite runs:
```bash
# OpenClaw gateway as a persistent service on port 8080
sprite-env services create openclaw-gateway \
  --cmd openclaw --args "gateway,run,--port,8080,--bind,lan,--token,<token>" \
  --http-port 8080
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build
npm run build
```

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Payments**: Stripe Checkout + Webhooks
- **Email**: Resend
- **AI Runtime**: OpenClaw (open-source AI assistant framework)
- **Infrastructure**: Sprite VMs (sprites.dev)
- **Hosting**: Vercel (web app), Sprites (orchestrator + customer instances)
