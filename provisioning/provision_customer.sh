#\!/bin/bash
# Customer sprite provisioning script
# Installs OpenClaw with selected skills and sets up as persistent service

set -e

# Configuration from environment
CUSTOMER_NAME="${CUSTOMER_NAME:-Customer}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-customer@example.com}"
USERNAME="${USERNAME:-user}"
PASSWORD="${PASSWORD:-changeme}"
SKILLS="${SKILLS:-}"
GATEWAY_TOKEN="${GATEWAY_TOKEN:-$(head -c 16 /dev/urandom | base64 | tr -dc a-zA-Z0-9 | head -c 24)}"

export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:$PATH
export HOME=/home/sprite

echo "=== OpenClaw Provisioning for $CUSTOMER_NAME ==="
echo "Email: $CUSTOMER_EMAIL"
echo "Username: $USERNAME"
echo "Skills: $SKILLS"

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
echo "OpenClaw Control UI: accessible via sprite public URL"