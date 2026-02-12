#!/usr/bin/env python3
"""
Arcamatrix Provisioning Agent
- Polls arcamatrix.com/api/tasks for PROV-* and RECYCLE-* tasks
- Provisions customer sprites (fast: OpenClaw pre-installed)
- Sends welcome email after provisioning
- Recycles sprites on cancellation (clean reset, keep OpenClaw)
- Auto-updates middleware.ts for subdomain routing
- Expands pool with pre-installed sprites when low
"""
import json
import time
import re
import subprocess
import requests
import sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).parent))
from sprite_pool import SpritePool

PROVISION_SCRIPT = Path("/home/sprite/provision_customer.sh")
PREPARE_SCRIPT = Path("/home/sprite/prepare_pool_sprite.sh")
AGENT_ID = "provisioning-agent"

SPRITES_API_BASE = "https://api.sprites.dev/v1"
SPRITES_TOKEN = "***REDACTED_SPRITES_TOKEN***"

ARCAMATRIX_API_BASE = "https://arcamatrix.com/api"
ADMIN_API_KEY = "***REDACTED_ADMIN_KEY***"
RESEND_API_KEY = "***REDACTED_RESEND_KEY***"

REPO_DIR = Path("/home/sprite/arcamatrix")
MIDDLEWARE_PATH = REPO_DIR / "src" / "middleware.ts"

POOL_MIN_AVAILABLE = 3  # Expand pool when fewer than this are available
POOL_EXPAND_COUNT = 3   # Create this many new sprites at a time


def log(msg):
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f"[{timestamp}] [{AGENT_ID}] {msg}", flush=True)


# ============================================================
# API helpers
# ============================================================

def get_pending_tasks(task_type):
    try:
        url = f"{ARCAMATRIX_API_BASE}/tasks?status=pending&type={task_type}"
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()
        prefix = "PROV-" if task_type == "provisioning" else "RECYCLE-"
        return [(tid, t) for tid, t in data.get('tasks', {}).items() if tid.startswith(prefix)]
    except Exception as e:
        log(f"Error fetching {task_type} tasks: {e}")
        return []


def update_task_status(task_id, status, result=None):
    try:
        payload = {"taskId": task_id, "status": status}
        if result:
            payload["result"] = result
        r = requests.patch(f"{ARCAMATRIX_API_BASE}/tasks", json=payload, timeout=30)
        r.raise_for_status()
    except Exception as e:
        log(f"Error updating task {task_id}: {e}")


def upload_file_via_api(sprite_name, local_path, remote_path):
    url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/fs/write"
    params = {"path": remote_path, "mkdir": "true"}
    headers = {"Authorization": f"Bearer {SPRITES_TOKEN}"}
    with open(local_path, 'rb') as f:
        content = f.read()
    r = requests.put(f"{url}?{urlencode(params)}", data=content, headers=headers, timeout=60)
    r.raise_for_status()


def exec_on_sprite(sprite_name, command, env_vars=None, timeout_sec=300):
    url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/exec"
    params = [("cmd", "bash"), ("cmd", "-c"), ("cmd", command)]
    if env_vars:
        for k, v in env_vars.items():
            params.append(("env", f"{k}={v}"))
    headers = {"Authorization": f"Bearer {SPRITES_TOKEN}"}
    r = requests.post(f"{url}?{urlencode(params)}", headers=headers, timeout=timeout_sec)
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        return {"output": r.text}


# ============================================================
# Email
# ============================================================

def send_welcome_email(customer_email, customer_name, username, gateway_token, skills):
    """Send welcome email via Resend after provisioning is complete."""
    sprite_url = f"https://{username}.arcamatrix.com"
    skills_list = '\n'.join(f'  - {s}' for s in skills) if skills else '  - General AI Assistant'

    html = f"""<!DOCTYPE html>
<html><head><style>
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}}
.header{{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:30px;border-radius:10px 10px 0 0;text-align:center}}
.content{{background:#f9fafb;padding:30px;border-radius:0 0 10px 10px}}
.cred-box{{background:#fff;border:2px solid #667eea;border-radius:8px;padding:20px;margin:20px 0}}
.cred-row{{display:flex;justify-content:space-between;margin:10px 0;padding:10px;background:#f3f4f6;border-radius:5px}}
.cred-label{{font-weight:bold;color:#667eea}}
.cred-value{{font-family:'Courier New',monospace;color:#1f2937}}
.btn{{display:inline-block;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:15px 30px;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}}
.footer{{text-align:center;margin-top:30px;color:#6b7280;font-size:14px}}
</style></head><body>
<div class="header"><h1>Welcome to Arcamatrix!</h1></div>
<div class="content">
<p>Hi {customer_name},</p>
<p>Your personal AI workspace is ready! Here are your login details:</p>
<div class="cred-box">
<h3 style="margin-top:0;color:#667eea">Your Login Credentials</h3>
<div class="cred-row"><span class="cred-label">Workspace URL:</span><span class="cred-value">{sprite_url}</span></div>
<div class="cred-row"><span class="cred-label">Access Token:</span><span class="cred-value">{gateway_token}</span></div>
<p style="margin-top:15px;color:#6b7280;font-size:14px">Please save your access token securely. You'll need it to log in.</p>
</div>
<div style="background:#fff;border-radius:8px;padding:20px;margin:20px 0">
<h3 style="margin-top:0;color:#667eea">Your Active Skills</h3>
<pre style="margin:0;white-space:pre-wrap;color:#1f2937">{skills_list}</pre>
</div>
<div style="text-align:center"><a href="{sprite_url}" class="btn">Open Your Workspace</a></div>
<h3 style="color:#667eea">Getting Started</h3>
<ol style="color:#4b5563">
<li>Click the button above to access your workspace</li>
<li>Enter your access token to log in</li>
<li>Start chatting with your AI assistant</li>
<li>Configure additional skills in the Skills tab</li>
</ol>
<p>Need help? Reply to this email.</p>
<p style="margin-top:30px">Best regards,<br><strong>The Arcamatrix Team</strong></p>
</div>
<div class="footer"><p>2026 Arcamatrix. All rights reserved.</p></div>
</body></html>"""

    try:
        r = requests.post("https://api.resend.com/emails", json={
            "from": "Arcamatrix <onboarding@arcamatrix.com>",
            "to": [customer_email],
            "subject": "Your Arcamatrix AI Workspace is Ready!",
            "html": html
        }, headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json"
        }, timeout=30)

        if r.ok:
            log(f"Welcome email sent to {customer_email}")
            return True
        else:
            log(f"Email failed: {r.status_code} {r.text}")
            return False
    except Exception as e:
        log(f"Email error: {e}")
        return False


# ============================================================
# Middleware mapping (git-based, permanent)
# ============================================================

def update_middleware_mapping(username, sprite_url):
    try:
        subprocess.run(["git", "pull", "--rebase"], cwd=REPO_DIR, capture_output=True, timeout=30)
        content = MIDDLEWARE_PATH.read_text()

        if f"'{username}'" in content:
            log(f"Middleware mapping for {username} already exists")
            return True

        pattern = r"(const customerMappings: Record<string, string> = \{[^}]*)"
        match = re.search(pattern, content, re.DOTALL)
        if not match:
            log("ERROR: Could not find customerMappings in middleware.ts")
            return False

        existing = match.group(1)
        new_entry = f"  '{username}': '{sprite_url}',"
        lines = existing.split('\n')
        insert_idx = len(lines) - 1
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip().startswith("'") or lines[i].strip().endswith("',"):
                insert_idx = i + 1
                break
        lines.insert(insert_idx, new_entry)
        content = content.replace(existing, '\n'.join(lines))
        MIDDLEWARE_PATH.write_text(content)

        subprocess.run(["git", "add", "src/middleware.ts"], cwd=REPO_DIR, capture_output=True, timeout=10)
        r = subprocess.run(["git", "commit", "-m", f"Add customer mapping: {username}"],
                          cwd=REPO_DIR, capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            log(f"Git commit failed: {r.stderr}")
            return False
        subprocess.run(["git", "push"], cwd=REPO_DIR, capture_output=True, timeout=30)
        log(f"Middleware mapping added for {username}")
        return True
    except Exception as e:
        log(f"Middleware update failed: {e}")
        subprocess.run(["git", "checkout", "--", "src/middleware.ts"], cwd=REPO_DIR, capture_output=True)
        return False


def remove_middleware_mapping(username):
    try:
        subprocess.run(["git", "pull", "--rebase"], cwd=REPO_DIR, capture_output=True, timeout=30)
        content = MIDDLEWARE_PATH.read_text()
        if f"'{username}'" not in content:
            return True
        lines = content.split('\n')
        content = '\n'.join(l for l in lines if f"'{username}'" not in l)
        MIDDLEWARE_PATH.write_text(content)
        subprocess.run(["git", "add", "src/middleware.ts"], cwd=REPO_DIR, capture_output=True, timeout=10)
        subprocess.run(["git", "commit", "-m", f"Remove customer mapping: {username}"],
                       cwd=REPO_DIR, capture_output=True, timeout=10)
        subprocess.run(["git", "push"], cwd=REPO_DIR, capture_output=True, timeout=30)
        log(f"Middleware mapping removed for {username}")
        return True
    except Exception as e:
        log(f"Middleware removal failed: {e}")
        subprocess.run(["git", "checkout", "--", "src/middleware.ts"], cwd=REPO_DIR, capture_output=True)
        return False


# ============================================================
# Provisioning
# ============================================================

def provision_sprite(task_id, task_data):
    meta = task_data.get('metadata', {})
    customer_email = meta.get('customerEmail', '')
    customer_name = meta.get('customerName', '')
    username = meta.get('username', '')
    gateway_token = meta.get('gatewayToken', '') or meta.get('password', '')
    skills = meta.get('skills', [])

    log(f"Provisioning {username} ({customer_email}), skills: {skills}")

    try:
        pool = SpritePool()
        sprite_info = pool.assign_sprite(username, customer_email, customer_name)
        if not sprite_info:
            raise Exception("No sprites available in pool")

        sprite_name = sprite_info['sprite_name']
        sprite_url = sprite_info['sprite_url']
        log(f"Assigned {sprite_name} ({sprite_url})")

        # Upload provision script
        upload_file_via_api(sprite_name, str(PROVISION_SCRIPT), "/home/sprite/provision_customer.sh")

        # Upload customer UI
        ui_path = Path('/home/sprite/arcamatrix-ui.html')
        if ui_path.exists():
            upload_file_via_api(sprite_name, str(ui_path), '/home/sprite/custom-ui/index.html')

        # Run fast provisioning (no npm install needed)
        env_vars = {
            'CUSTOMER_NAME': customer_name,
            'CUSTOMER_EMAIL': customer_email,
            'USERNAME': username,
            'GATEWAY_TOKEN': gateway_token,
            'SKILLS': ','.join(skills),
            'SPRITE_URL': sprite_url
        }
        result = exec_on_sprite(sprite_name, "bash /home/sprite/provision_customer.sh",
                               env_vars=env_vars, timeout_sec=120)
        log(f"Provisioning script completed for {username}")

        # Update middleware mapping (git push → Vercel auto-deploy)
        middleware_ok = update_middleware_mapping(username, sprite_url)

        # Register API mapping (backup)
        try:
            requests.post(f"{ARCAMATRIX_API_BASE}/customer-proxy", json={
                "action": "add", "username": username,
                "spriteUrl": sprite_url, "spriteName": sprite_name,
                "adminKey": ADMIN_API_KEY
            }, timeout=30)
        except Exception:
            pass

        # Send welcome email NOW (after everything is ready)
        customer_url = f"https://{username}.arcamatrix.com"
        email_ok = send_welcome_email(customer_email, customer_name, username, gateway_token, skills)

        # Check pool health
        pool_status = pool.get_pool_status()
        if pool_status['needs_expansion']:
            expand_pool()

        return {
            'success': True,
            'sprite_name': sprite_name,
            'sprite_url': customer_url,
            'sprite_internal_url': sprite_url,
            'username': username,
            'gateway_token': gateway_token,
            'middleware_updated': middleware_ok,
            'email_sent': email_ok,
            'message': 'Provisioning completed'
        }
    except Exception as e:
        log(f"Provisioning failed: {e}")
        if 'sprite_name' in locals():
            SpritePool().release_sprite(username)
        return {'success': False, 'error': str(e)}


# ============================================================
# Recycling (clean reset, keep OpenClaw)
# ============================================================

def handle_recycle(task_id, task_data):
    meta = task_data.get('metadata', {})
    username = meta.get('username', '')
    log(f"Recycling sprite for {username}")

    try:
        pool = SpritePool()
        sprite_info = pool.get_customer_sprite(username)
        if not sprite_info:
            return {'success': False, 'error': 'No sprite assigned'}

        sprite_name = sprite_info['sprite_name']

        # Stop gateway service
        try:
            exec_on_sprite(sprite_name, "sprite-env services delete openclaw-gateway", timeout_sec=30)
        except Exception:
            pass

        # Clean customer-specific data (keep OpenClaw binary)
        cleanup_cmds = [
            "rm -f /home/sprite/custom-ui/config.json",
            "rm -f /home/sprite/custom-ui/index.html",
            "rm -f /home/sprite/provision_customer.sh",
            "rm -rf /home/sprite/.openclaw/openclaw.json",
            "rm -rf /home/sprite/.openclaw/workspaces",
            "pkill -f 'openclaw' || true",
        ]
        for cmd in cleanup_cmds:
            try:
                exec_on_sprite(sprite_name, cmd, timeout_sec=15)
            except Exception:
                pass

        # Remove middleware mapping
        remove_middleware_mapping(username)

        # Remove API mapping
        try:
            requests.post(f"{ARCAMATRIX_API_BASE}/customer-proxy", json={
                "action": "remove", "username": username, "adminKey": ADMIN_API_KEY
            }, timeout=30)
        except Exception:
            pass

        # Return sprite to pool
        pool.release_sprite(username)
        log(f"Sprite {sprite_name} recycled and returned to pool")
        return {'success': True, 'sprite_name': sprite_name}
    except Exception as e:
        log(f"Recycle failed: {e}")
        return {'success': False, 'error': str(e)}


# ============================================================
# Pool expansion (create + pre-install OpenClaw)
# ============================================================

def expand_pool():
    pool = SpritePool()
    status = pool.get_pool_status()
    available = status['available']

    if available >= POOL_MIN_AVAILABLE:
        return

    log(f"Pool low ({available} available). Creating {POOL_EXPAND_COUNT} new sprites...")
    next_num = status['total'] + 1

    for i in range(POOL_EXPAND_COUNT):
        name = f"arca-customer-{next_num + i:03d}"
        try:
            # Create sprite
            headers = {"Authorization": f"Bearer {SPRITES_TOKEN}", "Content-Type": "application/json"}
            r = requests.post(f"{SPRITES_API_BASE}/sprites", json={
                "name": name, "url_settings": {"auth": "public"}
            }, headers=headers, timeout=60)
            r.raise_for_status()
            data = r.json()
            sprite_url = data.get('url', f"https://{name}-bl4yi.sprites.app")

            # Upload and run preparation script
            upload_file_via_api(name, str(PREPARE_SCRIPT), "/home/sprite/prepare_pool_sprite.sh")
            log(f"Pre-installing OpenClaw on {name}...")
            exec_on_sprite(name, "bash /home/sprite/prepare_pool_sprite.sh", timeout_sec=600)

            pool.add_sprite_to_pool(name, sprite_url)
            log(f"Pool sprite {name} ready ({sprite_url})")
        except Exception as e:
            log(f"Failed to prepare {name}: {e}")

    new_status = pool.get_pool_status()
    log(f"Pool: {new_status['available']} available, {new_status['total']} total")


# ============================================================
# Main loop
# ============================================================

def run_agent():
    log("Provisioning Agent started")
    log(f"Polling: {ARCAMATRIX_API_BASE}/tasks (30s interval)")
    log(f"Pool threshold: {POOL_MIN_AVAILABLE} min available")

    while True:
        try:
            # Provisioning tasks
            for task_id, task in get_pending_tasks("provisioning"):
                log(f"Processing {task_id}")
                update_task_status(task_id, 'in_progress')
                result = provision_sprite(task_id, task)
                status = 'completed' if result['success'] else 'failed'
                update_task_status(task_id, status, result)
                log(f"{task_id} {status}")

            # Recycle tasks
            for task_id, task in get_pending_tasks("recycle"):
                log(f"Processing {task_id}")
                update_task_status(task_id, 'in_progress')
                result = handle_recycle(task_id, task)
                status = 'completed' if result['success'] else 'failed'
                update_task_status(task_id, status, result)
                log(f"{task_id} {status}")

            time.sleep(30)
        except KeyboardInterrupt:
            log("Agent stopped")
            break
        except Exception as e:
            log(f"Agent error: {e}")
            time.sleep(30)


if __name__ == '__main__':
    run_agent()
