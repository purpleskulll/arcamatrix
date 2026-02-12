#!/bin/bash
# Customer sprite provisioning script
# Installs OpenClaw with selected skills and sets up as persistent service

set -e

# Configuration from environment
CUSTOMER_NAME="${CUSTOMER_NAME:-Customer}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-customer@example.com}"
USERNAME="${USERNAME:-user}"
PASSWORD="${PASSWORD:-changeme}"
SKILLS="${SKILLS:-}"
SPRITE_URL="${SPRITE_URL:-}"
GATEWAY_TOKEN="${GATEWAY_TOKEN:-$(head -c 16 /dev/urandom | base64 | tr -dc a-zA-Z0-9 | head -c 24)}"

export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:$PATH
export HOME=/home/sprite

echo "=== OpenClaw Provisioning for $CUSTOMER_NAME ==="
echo "Email: $CUSTOMER_EMAIL"
echo "Username: $USERNAME"
echo "Skills: $SKILLS"
echo "Sprite URL: $SPRITE_URL"

# Verify Node.js is available
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# Install OpenClaw globally
echo "Installing OpenClaw..."
npm install -g openclaw@latest --silent 2>&1 | tail -3

OPENCLAW_BIN="$(dirname $(which node))/openclaw"
echo "OpenClaw: $($OPENCLAW_BIN --version)"

# Run non-interactive onboard
echo "Configuring OpenClaw..."
$OPENCLAW_BIN onboard \
  --non-interactive \
  --accept-risk \
  --mode local \
  --flow quickstart \
  --gateway-bind lan \
  --gateway-port 8080 \
  --gateway-auth token \
  --gateway-token "$GATEWAY_TOKEN" \
  --auth-choice skip \
  --skip-channels \
  --skip-daemon \
  --skip-skills \
  --skip-health \
  --skip-ui 2>&1

# === Generate config.json for customer UI ===
echo "Generating config.json..."
mkdir -p /home/sprite/custom-ui
cat > /home/sprite/custom-ui/config.json << CONFIGEOF
{
  "gatewayUrl": "$SPRITE_URL",
  "customerName": "$CUSTOMER_NAME"
}
CONFIGEOF
echo "config.json created: $(cat /home/sprite/custom-ui/config.json)"

# === Set allowedOrigins for WebSocket CORS ===
echo "Configuring gateway allowedOrigins..."

# Wait for gateway config to be ready
sleep 2

# The OpenClaw config file location
OPENCLAW_CONFIG="/home/sprite/.openclaw/openclaw.json"

if [ -f "$OPENCLAW_CONFIG" ]; then
  # Use python to safely merge allowedOrigins into the config
  python3 << 'PYEOF'
import json, os

config_path = "/home/sprite/.openclaw/openclaw.json"
username = os.environ.get("USERNAME", "user")
sprite_url = os.environ.get("SPRITE_URL", "")

with open(config_path, 'r') as f:
    cfg = json.load(f)

# Ensure gateway.controlUi.allowedOrigins exists
if 'gateway' not in cfg:
    cfg['gateway'] = {}
if 'controlUi' not in cfg['gateway']:
    cfg['gateway']['controlUi'] = {}

cfg['gateway']['controlUi']['allowedOrigins'] = [
    f"https://{username}.arcamatrix.com",
    "https://arcamatrix.com",
    sprite_url
]

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2)

print(f"allowedOrigins set for {username}.arcamatrix.com")
PYEOF
else
  echo "WARNING: OpenClaw config not found at $OPENCLAW_CONFIG"
fi

# === Install skill environment variables ===
echo "Configuring skills: $SKILLS"

if [ -n "$SKILLS" ]; then
  python3 << 'PYEOF'
import json, os

config_path = "/home/sprite/.openclaw/openclaw.json"
skills_str = os.environ.get("SKILLS", "")

if not skills_str:
    print("No skills to configure")
    exit(0)

skills = [s.strip() for s in skills_str.split(',') if s.strip()]

with open(config_path, 'r') as f:
    cfg = json.load(f)

if 'env' not in cfg:
    cfg['env'] = {}

# Map skill names to their required env var placeholders
# These get set to empty strings as placeholders - users configure actual keys in the UI
skill_env_map = {
    'weather': {},  # No API key needed (wttr.in is free)
    'web-search': {'TAVILY_API_KEY': ''},
    'github': {'GITHUB_TOKEN': ''},
    'trello': {'TRELLO_API_KEY': '', 'TRELLO_TOKEN': ''},
    'notion': {'NOTION_API_KEY': ''},
    'google-calendar': {'GOOGLE_CALENDAR_CREDENTIALS': ''},
    'slack': {'SLACK_BOT_TOKEN': ''},
    'email': {},  # Needs himalaya binary
    'summarize': {},  # Needs summarize binary
    'filesystem': {},  # Built-in, no config needed
}

configured = []
for skill in skills:
    skill_lower = skill.lower().strip()
    if skill_lower in skill_env_map:
        for key, default in skill_env_map[skill_lower].items():
            if key not in cfg['env']:
                cfg['env'][key] = default
        configured.append(skill_lower)

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2)

print(f"Configured skill env vars for: {', '.join(configured)}")
PYEOF
fi

# Register as persistent sprite service with HTTP routing
echo "Registering gateway service..."
sprite-env services create openclaw-gateway \
  --cmd "$OPENCLAW_BIN" \
  --args "gateway,run,--port,8080,--bind,lan,--token,$GATEWAY_TOKEN" \
  --env "PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/usr/local/bin:/usr/bin:/bin,HOME=/home/sprite,OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN" \
  --dir /home/sprite \
  --http-port 8080 \
  --no-stream 2>&1

echo "=== Provisioning Complete ==="
echo "Gateway token: $GATEWAY_TOKEN"
echo "Customer URL: https://${USERNAME}.arcamatrix.com"
echo "Direct sprite URL: $SPRITE_URL"
echo "OpenClaw Control UI: accessible via sprite public URL"
