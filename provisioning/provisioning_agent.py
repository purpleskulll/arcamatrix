#!/usr/bin/env python3
"""
Swarm Provisioning Agent - Polls arcamatrix.com/api/tasks for PROV-* tasks.
Uses Sprites REST API for fully automated provisioning.
"""
import json
import time
import requests
import sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).parent))
from sprite_pool import SpritePool

PROVISION_SCRIPT = Path("/home/sprite/provision_customer.sh")
AGENT_ID = "provisioning-agent"

SPRITES_API_BASE = "https://api.sprites.dev/v1"
SPRITES_TOKEN = "***REDACTED_SPRITES_TOKEN***"

ARCAMATRIX_API_BASE = "https://arcamatrix.com/api"
ADMIN_API_KEY = "***REDACTED_ADMIN_KEY***"

def log(msg):
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f"[{timestamp}] [{AGENT_ID}] {msg}", flush=True)

def get_pending_provisioning_tasks():
    try:
        url = f"{ARCAMATRIX_API_BASE}/tasks?status=pending&type=provisioning"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        pending = []
        for task_id, task in data.get('tasks', {}).items():
            if task_id.startswith('PROV-'):
                pending.append((task_id, task))
        return pending
    except Exception as e:
        log(f"Error fetching tasks: {e}")
        return []

def get_pending_recycle_tasks():
    try:
        url = f"{ARCAMATRIX_API_BASE}/tasks?status=pending&type=recycle"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        pending = []
        for task_id, task in data.get('tasks', {}).items():
            if task_id.startswith('RECYCLE-'):
                pending.append((task_id, task))
        return pending
    except Exception as e:
        log(f"Error fetching recycle tasks: {e}")
        return []

def update_task_status(task_id, status, result=None):
    try:
        url = f"{ARCAMATRIX_API_BASE}/tasks"
        payload = {"taskId": task_id, "status": status}
        if result:
            payload["result"] = result
        response = requests.patch(url, json=payload, timeout=30)
        response.raise_for_status()
        log(f"Updated task {task_id} status to {status}")
    except Exception as e:
        log(f"Error updating task: {e}")

def upload_file_via_api(sprite_name, local_path, remote_path):
    url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/fs/write"
    params = {"path": remote_path, "mkdir": "true"}
    headers = {"Authorization": f"Bearer {SPRITES_TOKEN}"}
    with open(local_path, 'rb') as f:
        file_content = f.read()
    response = requests.put(f"{url}?{urlencode(params)}", data=file_content, headers=headers, timeout=30)
    response.raise_for_status()

def exec_command_via_api(sprite_name, command, env_vars=None, timeout_seconds=600):
    url = f"{SPRITES_API_BASE}/sprites/{sprite_name}/exec"
    params = [("cmd", "bash"), ("cmd", "-c"), ("cmd", command)]
    if env_vars:
        for key, value in env_vars.items():
            params.append(("env", f"{key}={value}"))
    headers = {"Authorization": f"Bearer {SPRITES_TOKEN}"}
    response = requests.post(f"{url}?{urlencode(params)}", headers=headers, timeout=timeout_seconds)
    response.raise_for_status()
    try:
        return response.json()
    except Exception:
        return {"output": response.text, "exit_code": 0}

def register_customer_mapping(username, sprite_url, sprite_name):
    url = f"{ARCAMATRIX_API_BASE}/customer-proxy"
    payload = {
        "action": "add",
        "username": username,
        "spriteUrl": sprite_url,
        "spriteName": sprite_name,
        "adminKey": ADMIN_API_KEY
    }
    try:
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"Failed to register customer mapping: {e}")
        return None

def expand_pool_if_needed():
    pool = SpritePool()
    status = pool.get_pool_status()
    if status['needs_expansion']:
        log(f"Pool low ({status['available']} available). Expanding by 5...")
        next_num = status['total'] + 1
        for i in range(5):
            name = f"arca-customer-{next_num + i:03d}"
            try:
                url = f"{SPRITES_API_BASE}/sprites"
                headers = {"Authorization": f"Bearer {SPRITES_TOKEN}", "Content-Type": "application/json"}
                payload = {"name": name, "url_settings": {"auth": "public"}}
                response = requests.post(url, json=payload, headers=headers, timeout=60)
                response.raise_for_status()
                data = response.json()
                sprite_url = data.get('url', f"https://{name}.bl4yi.sprites.app")
                pool.add_sprite_to_pool(name, sprite_url)
                log(f"Created and added {name} to pool")
            except Exception as e:
                log(f"Failed to create {name}: {e}")
        new_status = pool.get_pool_status()
        log(f"Pool expanded: {new_status['available']} available, {new_status['total']} total")

def provision_sprite(task_id, task_data):
    metadata = task_data.get('metadata', {})
    customer_email = metadata.get('customerEmail', '')
    customer_name = metadata.get('customerName', '')
    username = metadata.get('username', '')
    password = metadata.get('password', '')
    skills = metadata.get('skills', [])

    log(f"Starting provisioning for {customer_email}")
    log(f"Username: {username}, Skills: {skills}")

    try:
        pool = SpritePool()
        sprite_info = pool.assign_sprite(username, customer_email, customer_name)
        if not sprite_info:
            raise Exception("No sprites available in pool - expansion needed")

        sprite_name = sprite_info['sprite_name']
        sprite_internal_url = sprite_info['sprite_url']
        log(f"Assigned sprite from pool: {sprite_name}")

        log("Uploading provisioning script...")
        upload_file_via_api(sprite_name, PROVISION_SCRIPT, "/home/sprite/provision_customer.sh")
        log("Provisioning script uploaded")

        # Upload custom Arcamatrix UI
        custom_ui_path = Path('/home/sprite/arcamatrix-ui.html')
        if custom_ui_path.exists():
            log('Uploading custom Arcamatrix UI...')
            upload_file_via_api(sprite_name, str(custom_ui_path), '/home/sprite/custom-ui/index.html')
            log('Custom UI uploaded')
        else:
            log('WARNING: arcamatrix-ui.html not found, skipping custom UI upload')

        log("Running provisioning script...")
        skills_str = ','.join(skills)
        env_vars = {
            'CUSTOMER_NAME': customer_name,
            'CUSTOMER_EMAIL': customer_email,
            'USERNAME': username,
            'PASSWORD': password,
            'SKILLS': skills_str,
            'SPRITE_URL': sprite_internal_url
        }
        result = exec_command_via_api(sprite_name, "bash /home/sprite/provision_customer.sh", env_vars=env_vars, timeout_seconds=600)
        log(f"Provisioning completed for {customer_email}")

        customer_url = f"https://{username}.arcamatrix.com"

        log("Registering customer-sprite mapping...")
        mapping_result = register_customer_mapping(username, sprite_internal_url, sprite_name)
        if mapping_result:
            log(f"Customer mapping registered for {username}")

        pool_status = pool.get_pool_status()
        log(f"Pool status: {pool_status['available']} available, {pool_status['assigned']} assigned")

        if pool_status['needs_expansion']:
            expand_pool_if_needed()

        log(f"Customer URL: {customer_url}")
        return {
            'success': True,
            'sprite_name': sprite_name,
            'sprite_url': customer_url,
            'sprite_internal_url': sprite_internal_url,
            'username': username,
            'pool_status': pool_status,
            'message': 'Provisioning completed successfully'
        }
    except requests.exceptions.RequestException as e:
        log(f"API request failed: {e}")
        if 'sprite_name' in locals():
            SpritePool().release_sprite(username)
        return {'success': False, 'error': str(e), 'message': 'Provisioning failed - API error'}
    except Exception as e:
        log(f"Provisioning failed: {e}")
        if 'sprite_name' in locals():
            SpritePool().release_sprite(username)
        return {'success': False, 'error': str(e), 'message': 'Provisioning failed'}

def handle_recycle(task_id, task_data):
    metadata = task_data.get('metadata', {})
    username = metadata.get('username', '')
    log(f"Recycling sprite for {username}")
    try:
        pool = SpritePool()
        sprite_info = pool.get_customer_sprite(username)
        if not sprite_info:
            log(f"No sprite found for {username}")
            return {'success': False, 'error': 'No sprite assigned'}

        sprite_name = sprite_info['sprite_name']
        cmds = ["pkill -f 'openclaw gateway' || true", "rm -rf /home/sprite/openclaw-workspace/*", "rm -f /home/sprite/provision_customer.sh"]
        for cmd in cmds:
            try:
                exec_command_via_api(sprite_name, cmd, timeout_seconds=30)
            except:
                pass

        # Remove customer mapping
        try:
            requests.post(f"{ARCAMATRIX_API_BASE}/customer-proxy", json={"action": "remove", "username": username, "adminKey": ADMIN_API_KEY}, timeout=30)
        except:
            pass

        pool.release_sprite(username)
        log(f"Sprite {sprite_name} recycled and returned to pool")
        return {'success': True, 'sprite_name': sprite_name}
    except Exception as e:
        log(f"Recycle failed: {e}")
        return {'success': False, 'error': str(e)}

def run_agent():
    log("Provisioning Agent started (API mode)")
    log(f"Polling: {ARCAMATRIX_API_BASE}/tasks")
    log(f"Sprites API: {SPRITES_API_BASE}")

    while True:
        try:
            # Check provisioning tasks
            pending_tasks = get_pending_provisioning_tasks()
            if pending_tasks:
                log(f"Found {len(pending_tasks)} pending provisioning task(s)")
                for task_id, task in pending_tasks:
                    log(f"Processing task {task_id}")
                    update_task_status(task_id, 'in_progress')
                    result = provision_sprite(task_id, task)
                    if result['success']:
                        update_task_status(task_id, 'completed', result)
                        log(f"Task {task_id} completed successfully")
                    else:
                        update_task_status(task_id, 'failed', result)
                        log(f"Task {task_id} failed")

            # Check recycle tasks
            recycle_tasks = get_pending_recycle_tasks()
            if recycle_tasks:
                log(f"Found {len(recycle_tasks)} pending recycle task(s)")
                for task_id, task in recycle_tasks:
                    log(f"Processing recycle task {task_id}")
                    update_task_status(task_id, 'in_progress')
                    result = handle_recycle(task_id, task)
                    if result['success']:
                        update_task_status(task_id, 'completed', result)
                        log(f"Recycle task {task_id} completed")
                    else:
                        update_task_status(task_id, 'failed', result)
                        log(f"Recycle task {task_id} failed")

            time.sleep(30)
        except KeyboardInterrupt:
            log("Agent stopped by user")
            break
        except Exception as e:
            log(f"Agent error: {e}")
            time.sleep(30)

if __name__ == '__main__':
    run_agent()