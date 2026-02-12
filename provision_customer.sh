#!/bin/bash
# Customer sprite provisioning script (fast mode)
# Assumes OpenClaw is already pre-installed on the sprite.
# Only configures gateway, uploads UI, sets up customer-specific config.

set -e

CUSTOMER_NAME="${CUSTOMER_NAME:-Customer}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-customer@example.com}"
USERNAME="${USERNAME:-user}"
GATEWAY_TOKEN="${GATEWAY_TOKEN:-$(head -c 16 /dev/urandom | base64 | tr -dc a-zA-Z0-9 | head -c 24)}"
SKILLS="${SKILLS:-}"
SPRITE_URL="${SPRITE_URL:-}"

export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:$PATH
export HOME=/home/sprite

echo "=== Fast Provisioning for $CUSTOMER_NAME ==="
echo "Email: $CUSTOMER_EMAIL"
echo "Username: $USERNAME"
echo "Skills: $SKILLS"
echo "Sprite URL: $SPRITE_URL"

# Verify OpenClaw is pre-installed
OPENCLAW_BIN="$(which openclaw 2>/dev/null || echo '')"
if [ -z "$OPENCLAW_BIN" ]; then
  echo "ERROR: OpenClaw not pre-installed on this sprite!"
  echo "Run prepare_pool_sprite.sh first."
  exit 1
fi
echo "OpenClaw: $($OPENCLAW_BIN --version)"

# Run non-interactive onboard (configures gateway)
echo "Configuring OpenClaw gateway..."
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

# Generate config.json for customer UI (WebSocket direct connection)
echo "Generating config.json..."
mkdir -p /home/sprite/custom-ui
cat > /home/sprite/custom-ui/config.json << CONFIGEOF
{
  "gatewayUrl": "$SPRITE_URL",
  "customerName": "$CUSTOMER_NAME"
}
CONFIGEOF
echo "config.json: $(cat /home/sprite/custom-ui/config.json)"

# Set allowedOrigins for WebSocket CORS
echo "Setting allowedOrigins..."
OPENCLAW_CONFIG="/home/sprite/.openclaw/openclaw.json"
if [ -f "$OPENCLAW_CONFIG" ]; then
  python3 << 'PYEOF'
import json, os
config_path = "/home/sprite/.openclaw/openclaw.json"
username = os.environ.get("USERNAME", "user")
sprite_url = os.environ.get("SPRITE_URL", "")
with open(config_path, 'r') as f:
    cfg = json.load(f)
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
fi

# Configure skill env var placeholders
if [ -n "$SKILLS" ]; then
  echo "Configuring skills: $SKILLS"
  python3 << 'PYEOF'
import json, os
config_path = "/home/sprite/.openclaw/openclaw.json"
skills_str = os.environ.get("SKILLS", "")
if not skills_str:
    exit(0)
skills = [s.strip() for s in skills_str.split(',') if s.strip()]
with open(config_path, 'r') as f:
    cfg = json.load(f)
if 'env' not in cfg:
    cfg['env'] = {}
skill_env_map = {
    'weather': {},
    'web-search': {'TAVILY_API_KEY': ''},
    'github': {'GITHUB_TOKEN': ''},
    'trello': {'TRELLO_API_KEY': '', 'TRELLO_TOKEN': ''},
    'notion': {'NOTION_API_KEY': ''},
    'google-calendar': {'GOOGLE_CALENDAR_CREDENTIALS': ''},
    'slack': {'SLACK_BOT_TOKEN': ''},
    'email': {},
    'summarize': {},
    'filesystem': {},
}
for skill in skills:
    sl = skill.lower().strip()
    if sl in skill_env_map:
        for key, default in skill_env_map[sl].items():
            if key not in cfg['env']:
                cfg['env'][key] = default
with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2)
print(f"Skills configured: {', '.join(skills)}")
PYEOF
fi

# Register gateway as persistent service
echo "Starting gateway service..."
sprite-env services create openclaw-gateway \
  --cmd "$OPENCLAW_BIN" \
  --args "gateway,run,--port,8080,--bind,lan,--token,$GATEWAY_TOKEN" \
  --env "PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/usr/local/bin:/usr/bin:/bin,HOME=/home/sprite" \
  --dir /home/sprite \
  --http-port 8080 \
  --no-stream 2>&1

echo "=== Provisioning Complete ==="
echo "Gateway token: $GATEWAY_TOKEN"
echo "Customer URL: https://${USERNAME}.arcamatrix.com"
echo "Direct URL: $SPRITE_URL"
