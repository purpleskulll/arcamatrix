#!/bin/bash
# Provisioning Agent runner with auto-restart on crash
# SIGTERM to this script -> forwarded to python -> clean exit (no restart)
# Python crash (non-zero exit) -> restart with exponential backoff

export HOME=/home/sprite
export PATH=/.sprite/bin:/.sprite/languages/python/pyenv/versions/3.13.7/bin:/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/usr/local/bin:/usr/bin:/bin

# Required secrets — set these before running (or source from .env)
export SPRITES_TOKEN="${SPRITES_TOKEN:?Set SPRITES_TOKEN}"
export ADMIN_API_KEY="${ADMIN_API_KEY:?Set ADMIN_API_KEY}"
export RESEND_API_KEY="${RESEND_API_KEY:?Set RESEND_API_KEY}"

cd /home/sprite

BACKOFF=2
MAX_BACKOFF=60
CHILD_PID=0

# Forward SIGTERM to child python process
cleanup() {
    if [ $CHILD_PID -ne 0 ]; then
        kill -TERM $CHILD_PID 2>/dev/null
        wait $CHILD_PID 2>/dev/null
    fi
    exit 0
}
trap cleanup SIGTERM SIGINT

while true; do
    python3 /home/sprite/provisioning_agent.py &
    CHILD_PID=$!
    wait $CHILD_PID
    EXIT_CODE=$?
    CHILD_PID=0

    # Exit code 0 = clean shutdown (SIGTERM handled), don't restart
    if [ $EXIT_CODE -eq 0 ]; then
        echo "Agent exited cleanly (code 0), stopping"
        break
    fi

    echo "Agent crashed (exit code $EXIT_CODE), restarting in ${BACKOFF}s..."
    sleep $BACKOFF

    # Exponential backoff, cap at MAX_BACKOFF
    BACKOFF=$((BACKOFF * 2))
    if [ $BACKOFF -gt $MAX_BACKOFF ]; then
        BACKOFF=$MAX_BACKOFF
    fi
done