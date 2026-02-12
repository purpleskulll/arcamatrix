#!/usr/bin/env python3
"""Simple provisioning task service - adds customer provisioning tasks to blackboard."""
import json
import http.server
from datetime import datetime, timezone
from pathlib import Path

TASKS_FILE = Path("/home/sprite/swarm-orchestrator/blackboard/tasks.json")

def add_provisioning_task(data):
    """Add customer provisioning task to blackboard."""
    try:
        with open(TASKS_FILE, 'r') as f:
            blackboard = json.load(f)

        tasks = blackboard.get('tasks', {})
        task_num = len([t for t in tasks.keys() if t.startswith('PROV-')]) + 1
        task_id = f"PROV-{task_num:03d}"

        task = {
            'id': task_id,
            'title': f"Provision sprite for {data['customerEmail']}",
            'description': f"""Create Sprite VM and install OpenClaw for customer.

Customer: {data['customerName']} ({data['customerEmail']})
Username: {data['username']}
Password: {data['password']}
Sprite Name: {data['spriteName']}
Skills: {', '.join(data['skills'])}
Stripe Customer: {data['stripeCustomerId']}
Subscription: {data['subscriptionId']}

Steps:
1. Create sprite: sprite create {data['spriteName']}
2. Get sprite URL
3. Install OpenClaw with selected skills
4. Send welcome email with credentials to {data['customerEmail']}
""",
            'status': 'pending',
            'priority': 'high',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'metadata': data
        }

        tasks[task_id] = task
        blackboard['tasks'] = tasks

        with open(TASKS_FILE, 'w') as f:
            json.dump(blackboard, f, indent=2)

        print(f"[provision] Created task {task_id} for {data['customerEmail']}")
        return {'success': True, 'task_id': task_id}
    except Exception as e:
        print(f"[provision] Error: {e}")
        return {'success': False, 'error': str(e)}


class ProvisionHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, f, *a):
        pass

    def do_POST(self):
        if self.path == '/api/add-task':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            result = add_provisioning_task(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == '__main__':
    print("Provision service running on port 8081")
    http.server.HTTPServer(('0.0.0.0', 8081), ProvisionHandler).serve_forever()