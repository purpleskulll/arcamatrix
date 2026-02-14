#!/usr/bin/env python3
"""
Pflaster-Prinzip: Task-Wrapper Self-Healing for Arcamatrix

Wraps provisioning/recycle tasks with pre-checks and post-fixes:
- PRE:  Diagnose system health, apply quick patches if needed
- TASK: Execute the actual work in a healthy environment
- POST: Verify result, fix root causes permanently, remove patches
"""
import json
import time
import os
import subprocess
import requests
from pathlib import Path
from datetime import datetime, timezone

# ============================================================
# Configuration (same as provisioning_agent.py)
# ============================================================

SPRITES_API_BASE = "https://api.sprites.dev/v1"
SPRITES_TOKEN = os.environ.get("SPRITES_TOKEN", "")
ARCAMATRIX_API_BASE = "https://arcamatrix.com/api"
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
REPO_DIR = Path("/home/sprite/arcamatrix")
STATE_FILE = Path("/home/sprite/pflaster_state.json")
TASKS_FILE = Path("/home/sprite/blackboard/tasks.json")

# Lazy config: read from provisioning_agent.py globals when first needed
# (avoids circular import since provisioning_agent imports pflaster)
_config_loaded = False

def _ensure_config():
    global SPRITES_TOKEN, ADMIN_API_KEY, _config_loaded
    if _config_loaded or SPRITES_TOKEN:
        return
    _config_loaded = True
    try:
        import provisioning_agent as pa
        SPRITES_TOKEN = getattr(pa, 'SPRITES_TOKEN', '')
        ADMIN_API_KEY = getattr(pa, 'ADMIN_API_KEY', '')
    except Exception:
        pass


def log(msg):
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[{ts}] [pflaster] {msg}", flush=True)


# ============================================================
# State management
# ============================================================

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"patches": [], "log": []}


def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)
        f.flush()
        os.fsync(f.fileno())


def log_event(task_id, phase, entries):
    state = load_state()
    state["log"].append({
        "task_id": task_id,
        "phase": phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entries": entries
    })
    # Keep last 200 log entries
    if len(state["log"]) > 200:
        state["log"] = state["log"][-200:]
    save_state(state)


# ============================================================
# Sprites API helpers
# ============================================================

def sprites_api_headers():
    _ensure_config()
    return {"Authorization": f"Bearer {SPRITES_TOKEN}"}


def exec_on_sprite(sprite_name, command, timeout_sec=30):
    """Execute command on sprite via API (matches provisioning_agent format)."""
    from urllib.parse import urlencode
    try:
        url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/exec"
        params = [("cmd", "bash"), ("cmd", "-c"), ("cmd", command)]
        resp = requests.post(
            f"{url}?{urlencode(params)}",
            headers=sprites_api_headers(),
            timeout=timeout_sec + 10
        )
        if resp.ok:
            try:
                data = resp.json()
                output = data.get("output", "")
            except Exception:
                output = resp.text
            # Strip control characters from Sprites API response
            import re
            output = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', output)
            return output.strip()
        return None
    except Exception as e:
        log(f"exec_on_sprite({sprite_name}) failed: {e}")
        return None


# ============================================================
# PRE-HOOK CHECKS
# ============================================================

def check_pool_available():
    """Check if sprite pool has available sprites."""
    try:
        from sprite_pool import SpritePool
        pool = SpritePool()
        status = pool.get_pool_status()
        return status.get('available', 0)
    except Exception as e:
        log(f"Pool check failed: {e}")
        return -1  # Unknown


def check_sprites_api():
    """Check if Sprites API is reachable."""
    try:
        resp = requests.get(
            f"{SPRITES_API_BASE}/sprites",
            headers=sprites_api_headers(),
            timeout=10
        )
        return resp.ok
    except Exception:
        return False


def check_services_healthy(sprite_name):
    """Check if proxy (8080) and gateway (3001) are running on sprite via /pflaster/health."""
    output = exec_on_sprite(
        sprite_name,
        "curl -sf http://localhost:8080/pflaster/health --max-time 5 2>/dev/null || echo HEALTH_FAIL",
        timeout_sec=15
    )
    if not output or "HEALTH_FAIL" in str(output):
        return {"proxy": False, "gateway": False}

    try:
        import json as _json
        data = _json.loads(output.strip())
        return {"proxy": data.get("proxy", False), "gateway": data.get("gateway", False)}
    except Exception:
        return {"proxy": False, "gateway": False}


def check_git_repo():
    """Check if git repo is clean (no conflicts, no dirty state)."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(REPO_DIR), capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == ""
    except Exception:
        return False


def find_stale_tasks(max_age_minutes=60):
    """Find tasks stuck in 'in_progress' for too long."""
    stale = []
    try:
        with open(TASKS_FILE) as f:
            store = json.load(f)
        now = datetime.now(timezone.utc)
        for tid, task in store.get("tasks", {}).items():
            if task.get("status") != "in_progress":
                continue
            updated = task.get("updated_at", "")
            if not updated:
                continue
            try:
                updated_dt = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                age = (now - updated_dt).total_seconds() / 60
                if age > max_age_minutes:
                    stale.append(tid)
            except Exception:
                continue
    except Exception:
        pass
    return stale


# ============================================================
# PRE-HOOK PATCHES (Quick Fixes)
# ============================================================

def patch_emergency_sprite():
    """Emergency: create and prepare 1 sprite for immediate use."""
    log("PATCH: Emergency sprite creation...")
    try:
        from sprite_pool import SpritePool
        pool = SpritePool()

        # Find next available name
        pool_data = pool._load()
        existing = set(pool_data.get('sprites', {}).keys())
        for i in range(1, 100):
            name = f"arca-customer-{i:03d}"
            if name not in existing:
                break

        # Create sprite
        resp = requests.post(
            f"{SPRITES_API_BASE}/sprites",
            headers={**sprites_api_headers(), "Content-Type": "application/json"},
            json={"name": name},
            timeout=30
        )
        if not resp.ok:
            log(f"Failed to create sprite {name}: {resp.status_code}")
            return False

        sprite_url = resp.json().get("url", "")
        if not sprite_url:
            sprite_url = f"https://{name}-bl4yi.sprites.app"

        # Prepare (install OpenClaw)
        prepare_script = Path("/home/sprite/prepare_pool_sprite.sh")
        if prepare_script.exists():
            from provisioning_agent import upload_file_via_api
            upload_file_via_api(name, str(prepare_script), "/home/sprite/prepare_pool_sprite.sh")
            exec_on_sprite(name, "bash /home/sprite/prepare_pool_sprite.sh", timeout_sec=300)

        pool.add_sprite_to_pool(name, sprite_url)
        log(f"PATCH: Emergency sprite {name} ready")
        return True
    except Exception as e:
        log(f"PATCH: Emergency sprite failed: {e}")
        return False


def patch_wait_for_api(max_retries=3, backoff=5):
    """Wait for Sprites API to come back."""
    for i in range(max_retries):
        if check_sprites_api():
            return True
        wait = backoff * (i + 1)
        log(f"PATCH: API unreachable, waiting {wait}s (retry {i+1}/{max_retries})")
        time.sleep(wait)
    return check_sprites_api()


def patch_restart_services(sprite_name):
    """Restart crashed services on sprite."""
    log(f"PATCH: Restarting services on {sprite_name}")
    exec_on_sprite(sprite_name, "sprite-env service stop arcamatrix-proxy 2>/dev/null; sleep 1; sprite-env service start arcamatrix-proxy", timeout_sec=15)
    exec_on_sprite(sprite_name, "sprite-env service stop openclaw-gateway 2>/dev/null; sleep 1; sprite-env service start openclaw-gateway", timeout_sec=15)
    time.sleep(3)  # Give services time to start


def patch_git_reset():
    """Reset git repo to clean state."""
    log("PATCH: Resetting git repo to origin/main")
    try:
        subprocess.run(
            ["git", "fetch", "origin"],
            cwd=str(REPO_DIR), capture_output=True, timeout=30
        )
        subprocess.run(
            ["git", "reset", "--hard", "origin/main"],
            cwd=str(REPO_DIR), capture_output=True, timeout=10
        )
        return True
    except Exception as e:
        log(f"PATCH: Git reset failed: {e}")
        return False


def patch_reset_stale_task(task_id):
    """Reset a stale in_progress task to failed."""
    log(f"PATCH: Resetting stale task {task_id} to failed")
    try:
        import fcntl
        with open(TASKS_FILE, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            store = json.load(f)
            if task_id in store.get("tasks", {}):
                store["tasks"][task_id]["status"] = "failed"
                store["tasks"][task_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
                store["tasks"][task_id].setdefault("result", {})["error"] = "Reset by pflaster: stale in_progress"
                f.seek(0)
                f.truncate()
                json.dump(store, f, indent=2)
            fcntl.flock(f, fcntl.LOCK_UN)
        return True
    except Exception as e:
        log(f"PATCH: Task reset failed: {e}")
        return False


# ============================================================
# POST-HOOK ROOT-CAUSE FIXES
# ============================================================

def fix_expand_pool(target_available=5):
    """Permanently expand pool to target available count."""
    log(f"ROOT-FIX: Expanding pool to {target_available} available sprites")
    try:
        from sprite_pool import SpritePool
        pool = SpritePool()
        status = pool.get_pool_status()
        needed = target_available - status.get('available', 0)
        if needed <= 0:
            return

        from provisioning_agent import upload_file_via_api
        prepare_script = Path("/home/sprite/prepare_pool_sprite.sh")
        pool_data = pool._load()
        existing = set(pool_data.get('sprites', {}).keys())

        created = 0
        for i in range(1, 100):
            if created >= needed:
                break
            name = f"arca-customer-{i:03d}"
            if name in existing:
                continue

            try:
                resp = requests.post(
                    f"{SPRITES_API_BASE}/sprites",
                    headers={**sprites_api_headers(), "Content-Type": "application/json"},
                    json={"name": name},
                    timeout=30
                )
                if resp.ok:
                    sprite_url = resp.json().get("url", f"https://{name}-bl4yi.sprites.app")
                    if prepare_script.exists():
                        upload_file_via_api(name, str(prepare_script), "/home/sprite/prepare_pool_sprite.sh")
                        exec_on_sprite(name, "bash /home/sprite/prepare_pool_sprite.sh", timeout_sec=300)
                    pool.add_sprite_to_pool(name, sprite_url)
                    created += 1
                    log(f"ROOT-FIX: Pool sprite {name} ready")
            except Exception as e:
                log(f"ROOT-FIX: Failed to create {name}: {e}")

        log(f"ROOT-FIX: Pool expansion done, created {created} sprites")
    except Exception as e:
        log(f"ROOT-FIX: Pool expansion failed: {e}")


def fix_install_watchdog(sprite_name):
    """Install a crontab watchdog that auto-restarts crashed services."""
    log(f"ROOT-FIX: Installing watchdog on {sprite_name}")
    watchdog = (
        '#!/bin/bash\n'
        '# Pflaster watchdog - restarts crashed services\n'
        'if ! pgrep -f "node.*proxy.js" > /dev/null 2>&1; then\n'
        '  cd /home/sprite && sprite-env service start arcamatrix-proxy 2>/dev/null\n'
        '  echo "[$(date -u +%FT%TZ)] watchdog: restarted proxy" >> /home/sprite/watchdog.log\n'
        'fi\n'
        'if ! pgrep -f "openclaw" > /dev/null 2>&1; then\n'
        '  cd /home/sprite && sprite-env service start openclaw-gateway 2>/dev/null\n'
        '  echo "[$(date -u +%FT%TZ)] watchdog: restarted gateway" >> /home/sprite/watchdog.log\n'
        'fi\n'
    )
    import base64
    b64 = base64.b64encode(watchdog.encode()).decode()
    exec_on_sprite(
        sprite_name,
        f"echo '{b64}' | base64 -d > /home/sprite/watchdog.sh && chmod +x /home/sprite/watchdog.sh",
        timeout_sec=10
    )
    # Install crontab (every 2 minutes)
    exec_on_sprite(
        sprite_name,
        "( crontab -l 2>/dev/null | grep -v watchdog; echo '*/2 * * * * /home/sprite/watchdog.sh' ) | crontab -",
        timeout_sec=10
    )
    log(f"ROOT-FIX: Watchdog installed on {sprite_name}")


def fix_verify_services(sprite_name):
    """Verify services are running after task completion."""
    health = check_services_healthy(sprite_name)
    if not health["proxy"] or not health["gateway"]:
        log(f"POST-VERIFY: Services unhealthy on {sprite_name}, restarting")
        patch_restart_services(sprite_name)
        time.sleep(3)
        health = check_services_healthy(sprite_name)
        if not health["proxy"] or not health["gateway"]:
            log(f"POST-VERIFY: Services STILL unhealthy on {sprite_name} after restart")
            return False
    return True


def fix_verify_mapping(username):
    """Verify customer mapping is registered."""
    _ensure_config()
    try:
        resp = requests.get(
            f"{ARCAMATRIX_API_BASE}/customer-proxy?username={username}",
            headers={"x-admin-key": ADMIN_API_KEY},
            timeout=10
        )
        if resp.status_code == 404:
            log(f"POST-VERIFY: Mapping missing for {username}, registering...")
            from sprite_pool import SpritePool
            pool = SpritePool()
            sprite_info = pool.get_customer_sprite(username)
            if sprite_info:
                requests.post(
                    f"{ARCAMATRIX_API_BASE}/customer-proxy",
                    json={
                        "action": "add",
                        "username": username,
                        "spriteUrl": sprite_info['sprite_url'],
                        "spriteName": sprite_info['sprite_name'],
                        "adminKey": ADMIN_API_KEY
                    },
                    timeout=15
                )
                log(f"POST-VERIFY: Mapping registered for {username}")
            return False
        return resp.ok
    except Exception as e:
        log(f"POST-VERIFY: Mapping check failed: {e}")
        return False


# ============================================================
# MAIN WRAPPER
# ============================================================

def pflaster_wrap(task_fn, task_id, task_data):
    """
    Pflaster-Prinzip wrapper:
    1. PRE:  Diagnose + quick-patch
    2. TASK: Execute in healthy environment
    3. POST: Verify + root-cause fix + cleanup
    """
    patches = pflaster_pre(task_id, task_data)
    result = task_fn(task_id, task_data)
    pflaster_post(task_id, task_data, result, patches)
    return result


def pflaster_pre(task_id, task_data):
    """Pre-hook: diagnose system and apply patches if needed."""
    patches = []
    log(f"PRE [{task_id}]: Running pre-flight checks...")

    # 1. Sprites API reachable?
    if not check_sprites_api():
        log(f"PRE [{task_id}]: Sprites API unreachable, waiting...")
        if patch_wait_for_api():
            patches.append({"type": "api_wait", "action": "waited for API recovery"})
        else:
            patches.append({"type": "api_wait", "action": "API still down after retries", "critical": True})

    # 2. Pool has available sprites? (only for provisioning)
    task_type = task_data.get("type", "")
    if task_type == "provisioning":
        available = check_pool_available()
        if available == 0:
            log(f"PRE [{task_id}]: Pool empty! Creating emergency sprite...")
            if patch_emergency_sprite():
                patches.append({"type": "pool_emergency", "action": "created 1 emergency sprite"})
            else:
                patches.append({"type": "pool_emergency", "action": "emergency creation failed", "critical": True})
        elif available > 0:
            log(f"PRE [{task_id}]: Pool OK ({available} available)")

    # 3. Git repo clean?
    if not check_git_repo():
        log(f"PRE [{task_id}]: Git repo dirty, resetting...")
        if patch_git_reset():
            patches.append({"type": "git_reset", "action": "reset to origin/main"})

    # 4. Stale tasks?
    stale = find_stale_tasks(max_age_minutes=60)
    for stale_id in stale:
        if stale_id != task_id:  # Don't reset ourselves
            patch_reset_stale_task(stale_id)
            patches.append({"type": "orphan_cleanup", "target": stale_id})

    # 5. Target sprite services healthy? (for recycle, check the sprite being recycled)
    if task_type == "recycle":
        username = task_data.get("metadata", {}).get("username", "")
        if username:
            try:
                from sprite_pool import SpritePool
                sprite_info = SpritePool().get_customer_sprite(username)
                if sprite_info:
                    sprite_name = sprite_info['sprite_name']
                    health = check_services_healthy(sprite_name)
                    log(f"PRE [{task_id}]: {sprite_name} health: proxy={health['proxy']}, gateway={health['gateway']}")
            except Exception:
                pass

    if patches:
        log(f"PRE [{task_id}]: Applied {len(patches)} patches")
    else:
        log(f"PRE [{task_id}]: All checks passed, no patches needed")

    log_event(task_id, "pre", patches)
    return patches


def pflaster_post(task_id, task_data, result, patches):
    """Post-hook: verify result, fix root causes, remove patches."""
    fixes = []
    task_type = task_data.get("type", "")
    success = result.get("success", False) if isinstance(result, dict) else False

    log(f"POST [{task_id}]: Task {'succeeded' if success else 'FAILED'}")

    if not success:
        log_event(task_id, "post", [{"type": "task_failed", "error": str(result.get("error", "unknown"))}])
        return

    # 1. ROOT-CAUSE FIXES for pre-patches
    for patch in patches:
        if patch["type"] == "pool_emergency":
            # Pool was empty → expand properly in background
            fix_expand_pool(target_available=5)
            fixes.append({"patch_type": "pool_emergency", "fix": "pool expanded to 5"})

        elif patch["type"] == "service_restart":
            # Service was down → install watchdog for permanent fix
            target = patch.get("target", "")
            if target:
                fix_install_watchdog(target)
                fixes.append({"patch_type": "service_restart", "fix": f"watchdog installed on {target}"})

        elif patch["type"] == "git_reset":
            fixes.append({"patch_type": "git_reset", "fix": "logged for investigation"})

        elif patch["type"] == "orphan_cleanup":
            fixes.append({"patch_type": "orphan_cleanup", "fix": f"stale task {patch.get('target')} reset"})

    # 2. POST-VERIFICATION (verify task result is actually solid)
    if task_type == "provisioning":
        sprite_name = result.get("sprite_name", "")
        username = task_data.get("metadata", {}).get("username", "")

        # Verify services running
        if sprite_name:
            if fix_verify_services(sprite_name):
                log(f"POST [{task_id}]: Services verified on {sprite_name}")
            else:
                fixes.append({"type": "services_unhealthy", "target": sprite_name})
                # Install watchdog as root-cause fix
                fix_install_watchdog(sprite_name)

        # Verify mapping registered
        if username:
            if fix_verify_mapping(username):
                log(f"POST [{task_id}]: Mapping verified for {username}")
            else:
                fixes.append({"type": "mapping_fixed", "target": username})

        # Verify email sent
        email_sent = result.get("email_sent", False)
        if not email_sent:
            log(f"POST [{task_id}]: WARNING - Welcome email may not have been sent")
            fixes.append({"type": "email_warning", "note": "email_sent flag not set"})

    # 3. Pool health after task
    available = check_pool_available()
    if 0 <= available < 3:
        log(f"POST [{task_id}]: Pool low ({available} available), expanding...")
        fix_expand_pool(target_available=5)
        fixes.append({"type": "pool_refill", "fix": f"pool expanded (was {available})"})

    if fixes:
        log(f"POST [{task_id}]: Applied {len(fixes)} root-cause fixes")
    else:
        log(f"POST [{task_id}]: No root-cause fixes needed")

    log_event(task_id, "post", fixes)
