#!/bin/bash
# Prepare a pool sprite by pre-installing OpenClaw.
# Run this on each new sprite BEFORE marking it as available in the pool.
# After this, the sprite is ready for fast customer provisioning.

set -e

export PATH=/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:$PATH
export HOME=/home/sprite

echo "=== Pool Sprite Preparation ==="
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# Install OpenClaw globally
echo "Installing OpenClaw (this takes a few minutes)..."
npm install -g openclaw@2026.2.9 2>&1

OPENCLAW_BIN="$(which openclaw)"
echo "OpenClaw installed: $($OPENCLAW_BIN --version)"

# Create custom-ui directory
mkdir -p /home/sprite/custom-ui

echo "=== Pool Sprite Ready ==="
echo "OpenClaw is installed. Sprite can now be assigned to customers."
