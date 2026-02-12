#!/usr/bin/env python3
"""
Sprite Recycling Script - Clean and release sprite back to pool
"""
import requests
import sys
from sprite_pool import SpritePool
from urllib.parse import urlencode

SPRITES_API_BASE = "https://api.sprites.dev/v1"
SPRITES_TOKEN = "***REDACTED_SPRITES_TOKEN***"
ARCAMATRIX_API_BASE = "https://arcamatrix.com/api"
ADMIN_API_KEY = "***REDACTED_ADMIN_KEY***"

def clean_sprite(sprite_name):
    print(f"Cleaning {sprite_name}...")
    try:
        commands = [
            "pkill -f customer_ui.py || true",
            "pkill -f 'openclaw gateway' || true",
            "rm -rf /home/sprite/openclaw-workspace/*",
            "rm -f /home/sprite/customer_ui.py",
            "rm -f /home/sprite/provision_customer.sh"
        ]
        for cmd in commands:
            url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/exec"
            params = [("cmd", "bash"), ("cmd", "-c"), ("cmd", cmd)]
            headers = {"Authorization": f"Bearer {SPRITES_TOKEN}"}
            response = requests.post(f"{url}?{urlencode(params)}", headers=headers, timeout=30)
            if response.status_code != 200:
                print(f"Warning: Command failed: {cmd}")
        print(f"Sprite {sprite_name} cleaned")
        return True
    except Exception as e:
        print(f"Failed to clean sprite: {e}")
        return False

def remove_customer_mapping(username):
    print(f"Removing customer mapping for {username}...")
    try:
        url = f"{ARCAMATRIX_API_BASE}/customer-proxy"
        response = requests.post(url, json={"action": "remove", "username": username, "adminKey": ADMIN_API_KEY}, headers={"Content-Type": "application/json"}, timeout=30)
        if response.status_code == 200:
            print("Customer mapping removed")
            return True
        else:
            print(f"Failed to remove mapping: {response.text}")
            return False
    except Exception as e:
        print(f"Failed to remove mapping: {e}")
        return False

def recycle_sprite(username):
    print(f"\nRecycling sprite for customer: {username}")
    pool = SpritePool()
    sprite_info = pool.get_customer_sprite(username)
    if not sprite_info:
        print(f"No sprite assigned to {username}")
        return False
    sprite_name = sprite_info['sprite_name']
    print(f"Sprite: {sprite_name}")
    if not clean_sprite(sprite_name):
        print("Warning: Cleaning failed but continuing...")
    if not remove_customer_mapping(username):
        print("Warning: Mapping removal failed but continuing...")
    if pool.release_sprite(username):
        print(f"Sprite {sprite_name} released back to pool")
        status = pool.get_pool_status()
        print(f"Pool status: {status['available']} available, {status['assigned']} assigned")
        return True
    else:
        print(f"Failed to release sprite back to pool")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: recycle_sprite.py <username>")
        sys.exit(1)
    username = sys.argv[1]
    success = recycle_sprite(username)
    sys.exit(0 if success else 1)