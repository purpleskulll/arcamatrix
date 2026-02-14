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