#!/bin/bash
# CLAWDBOT Installer - Installs OpenClaw with selected skills
# Usage: ./clawdbot_installer.sh '{"skills": ["whatsapp", "email", "calendar"]}'

set -e

CONFIG_JSON="${1:-{}}"
OPENCLAW_DIR="$HOME/.openclaw"

echo "================================"
echo "CLAWDBOT Installer"
echo "================================"
echo "Config: $CONFIG_JSON"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js >= 22"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "Node.js version: $(node -v)"

# Install OpenClaw globally
echo ""
echo "Installing OpenClaw..."
npm install -g openclaw@latest 2>/dev/null || {
    echo "npm global install failed, trying local..."
    npm install openclaw@latest
}

# Create config directory
mkdir -p "$OPENCLAW_DIR"

# Parse and write skills config
echo ""
echo "Configuring skills..."
SKILLS=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('skills', [])))" 2>/dev/null || echo "[]")

cat > "$OPENCLAW_DIR/skills_config.json" << EOF
{
  "enabled_skills": $SKILLS,
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "1.0.0",
  "gatekeeper_enabled": true
}
EOF

echo "Skills config written to $OPENCLAW_DIR/skills_config.json"
cat "$OPENCLAW_DIR/skills_config.json"

# Create startup script
cat > "$OPENCLAW_DIR/start.sh" << 'STARTEOF'
#!/bin/bash
# Start CLAWDBOT with Gatekeeper

# Source environment
export OPENCLAW_HOME="$HOME/.openclaw"
export GATEKEEPER_ENABLED=true

# Start gateway
echo "Starting OpenClaw Gateway..."
openclaw gateway --port 18789 &
GATEWAY_PID=$!

echo "Gateway PID: $GATEWAY_PID"
echo $GATEWAY_PID > "$OPENCLAW_HOME/gateway.pid"

# Wait for gateway
sleep 3

# Check if running
if kill -0 $GATEWAY_PID 2>/dev/null; then
    echo "Gateway started successfully"
    echo "Access at: http://localhost:18789"
else
    echo "Gateway failed to start"
    exit 1
fi
STARTEOF

chmod +x "$OPENCLAW_DIR/start.sh"

# Set up safety boundaries (read-only config)
echo ""
echo "Setting up safety boundaries..."
chmod 444 "$OPENCLAW_DIR/skills_config.json"

echo ""
echo "================================"
echo "Installation complete!"
echo "================================"
echo ""
echo "To start CLAWDBOT:"
echo "  $OPENCLAW_DIR/start.sh"
echo ""
echo "Customer must provide their own API key via:"
echo "  export ANTHROPIC_API_KEY=sk-ant-..."
echo ""
