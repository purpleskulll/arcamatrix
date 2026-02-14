#!/bin/bash
# Customer sprite provisioning script (fast mode)
# Assumes OpenClaw is already pre-installed on the sprite.
# Sets up: gateway on port 3001 + reverse proxy on port 8080 serving custom UI

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
  exit 1
fi
echo "OpenClaw: $($OPENCLAW_BIN --version)"

# Run non-interactive onboard (configures gateway on port 3001)
echo "Configuring OpenClaw gateway on port 3001..."
$OPENCLAW_BIN onboard \
  --non-interactive \
  --accept-risk \
  --mode local \
  --flow quickstart \
  --gateway-bind lan \
  --gateway-port 3001 \
  --gateway-auth token \
  --gateway-token "$GATEWAY_TOKEN" \
  --auth-choice skip \
  --skip-channels \
  --skip-daemon \
  --skip-skills \
  --skip-health \
  --skip-ui 2>&1

# Force port 3001 in config (onboard may default to 8080)
python3 << 'PYEOF'
import json
with open('/home/sprite/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
cfg['gateway']['port'] = 3001
cfg['gateway']['trustedProxies'] = ['127.0.0.1', '::1', '0.0.0.0/0']
with open('/home/sprite/.openclaw/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Gateway port set to 3001')
PYEOF

# Generate config.json for customer UI
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

# Create gateway wrapper script (avoids shell escaping issues with service args)
echo "Creating gateway start script..."
cat > /home/sprite/run_gateway.sh << GWEOF
#!/bin/bash
export HOME=/home/sprite
export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/.sprite/bin:/usr/local/bin:/usr/bin:/bin
cd /home/sprite
exec openclaw gateway run --port 3001 --bind lan --token $GATEWAY_TOKEN
GWEOF
chmod +x /home/sprite/run_gateway.sh

# Start OpenClaw gateway on port 3001 (internal, WebSocket only)
echo "Starting gateway service on port 3001..."
sprite-env services create openclaw-gateway \
  --cmd bash \
  --args "/home/sprite/run_gateway.sh" \
  --dir /home/sprite \
  --no-stream 2>&1

sleep 3

# Create proxy wrapper script (sets CUSTOMER_EMAIL env var)
# Generate a persistent SESSION_SECRET for this customer
SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

cat > /home/sprite/run_proxy.sh << PROXYEOF
#!/bin/bash
export HOME=/home/sprite
export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/usr/local/bin:/usr/bin:/bin
export SESSION_SECRET="$SESSION_SECRET"
export CUSTOMER_EMAIL="$CUSTOMER_EMAIL"
cd /home/sprite
exec node /home/sprite/proxy.js
PROXYEOF
chmod +x /home/sprite/run_proxy.sh

# Start reverse proxy on port 8080 (public, serves custom UI + proxies WebSocket)
echo "Starting Arcamatrix proxy on port 8080..."
sprite-env services create arcamatrix-proxy \
  --cmd bash \
  --args "/home/sprite/run_proxy.sh" \
  --dir /home/sprite \
  --http-port 8080 \
  --no-stream 2>&1


# Deploy log rotation script and start service
echo "Setting up log rotation..."
cat > /home/sprite/rotate_logs.sh << 'LOGEOF'
#!/bin/bash
# Log rotation service — runs every hour, rotates logs > 500KB
# Keeps last 1000 lines, archives the rest to .1 (single backup)

MAX_BYTES=512000  # 500KB
KEEP_LINES=1000
INTERVAL=3600     # 1 hour

rotate_file() {
  local f="$1"
  local size
  size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if [ "$size" -gt "$MAX_BYTES" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Rotating $f (${size} bytes)"
    cp "$f" "${f}.1"
    tail -n "$KEEP_LINES" "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
  fi
}

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Log rotation service started (max=${MAX_BYTES}B, keep=${KEEP_LINES} lines, interval=${INTERVAL}s)"

while true; do
  for logfile in /.sprite/logs/services/*.log /home/sprite/*.log; do
    [ -f "$logfile" ] && rotate_file "$logfile"
  done
  sleep "$INTERVAL"
done
LOGEOF
chmod +x /home/sprite/rotate_logs.sh

sprite-env services create log-rotator \
  --cmd bash \
  --args "/home/sprite/rotate_logs.sh" \
  --no-stream 2>&1

echo "=== Provisioning Complete ==="
echo "Gateway token: $GATEWAY_TOKEN"
echo "Gateway: localhost:3001 (internal)"
echo "Proxy: 0.0.0.0:8080 (public, custom UI)"
echo "Customer URL: https://${USERNAME}.arcamatrix.com"
echo "Direct URL: $SPRITE_URL"