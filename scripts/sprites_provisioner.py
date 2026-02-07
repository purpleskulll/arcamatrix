#!/usr/bin/env python3
"""
Sprites Provisioner - Creates new Sprite VMs for customers.
Part of Arcamatrix swarm orchestration.
"""

import json
import os
import shlex
import subprocess
import time
from datetime import datetime
from pathlib import Path

SPRITES_API_TOKEN = os.environ.get("SPRITES_API_TOKEN", "")

class SpritesProvisioner:
    def __init__(self):
        self.token = SPRITES_API_TOKEN
        if not self.token:
            print("WARNING: SPRITES_API_TOKEN not set in environment")
        
    def create_sprite(self, name: str) -> dict:
        """Create a new sprite VM."""
        print(f"[{datetime.utcnow().isoformat()}] Creating sprite: {name}")
        
        try:
            result = subprocess.run(
                ["sprite", "create", name],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "name": name,
                    "output": result.stdout
                }
            else:
                return {
                    "success": False,
                    "error": result.stderr
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def exec_on_sprite(self, sprite_name: str, command: str) -> dict:
        """Execute a command on a sprite."""
        try:
            # Use shlex.split for safe command parsing
            cmd_parts = shlex.split(command)
            result = subprocess.run(
                ["sprite", "-s", sprite_name, "exec", "--"] + cmd_parts,
                capture_output=True,
                text=True,
                timeout=300
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def install_clawdbot(self, sprite_name: str, skills: list) -> dict:
        """Install OpenClaw/CLAWDBOT on a sprite with selected skills."""
        print(f"[{datetime.utcnow().isoformat()}] Installing CLAWDBOT on {sprite_name}")
        
        # Install OpenClaw
        install_result = self.exec_on_sprite(sprite_name, "npm install -g openclaw@latest")
        if not install_result["success"]:
            return {"success": False, "step": "install", "error": install_result}
        
        # Create skills config
        skills_config = {
            "enabled_skills": skills,
            "created_at": datetime.utcnow().isoformat(),
            "version": "1.0"
        }
        
        # Write config via exec
        config_json = json.dumps(skills_config)
        self.exec_on_sprite(sprite_name, f"mkdir -p /home/sprite/.openclaw")
        
        # Use tee to write the config
        subprocess.run(
            ["sprite", "-s", sprite_name, "exec", "--", "tee", "/home/sprite/.openclaw/skills_config.json"],
            input=config_json,
            text=True,
            capture_output=True
        )
        
        print(f"  Skills configured: {skills}")
        return {"success": True, "skills": skills}
    
    def setup_gatekeeper(self, sprite_name: str) -> dict:
        """Set up the Gatekeeper security wrapper."""
        print(f"[{datetime.utcnow().isoformat()}] Setting up Gatekeeper on {sprite_name}")
        
        # Copy gatekeeper script to sprite
        gatekeeper_path = Path("/home/sprite/arcamatrix/scripts/gatekeeper.py")
        if gatekeeper_path.exists():
            with open(gatekeeper_path) as f:
                gatekeeper_code = f.read()
            
            subprocess.run(
                ["sprite", "-s", sprite_name, "exec", "--", "tee", "/home/sprite/gatekeeper.py"],
                input=gatekeeper_code,
                text=True,
                capture_output=True
            )
            return {"success": True}
        
        return {"success": False, "error": "Gatekeeper script not found"}
    
    def provision_customer(self, customer_email: str, skills: list, ticket_id: str) -> dict:
        """Full provisioning workflow for a new customer."""
        # Generate unique sprite name
        customer_id = customer_email.split("@")[0].replace(".", "-")[:20]
        sprite_name = f"arca-{customer_id}-{int(time.time())}"
        
        print(f"\n{'='*60}")
        print(f"PROVISIONING NEW CUSTOMER")
        print(f"{'='*60}")
        print(f"Customer: {customer_email}")
        print(f"Ticket: {ticket_id}")
        print(f"Sprite: {sprite_name}")
        print(f"Skills: {skills}")
        
        # Step 1: Create sprite
        create_result = self.create_sprite(sprite_name)
        if not create_result["success"]:
            return {"success": False, "step": "create", "error": create_result}
        
        # Step 2: Install CLAWDBOT
        install_result = self.install_clawdbot(sprite_name, skills)
        if not install_result["success"]:
            return {"success": False, "step": "install", "error": install_result}
        
        # Step 3: Setup Gatekeeper
        gatekeeper_result = self.setup_gatekeeper(sprite_name)
        
        # Step 4: Get sprite URL
        url_result = self.exec_on_sprite(sprite_name, "sprite url")
        sprite_url = url_result.get("stdout", "").strip()
        
        result = {
            "success": True,
            "sprite_name": sprite_name,
            "sprite_url": sprite_url,
            "customer_email": customer_email,
            "skills": skills,
            "ticket_id": ticket_id,
            "provisioned_at": datetime.utcnow().isoformat()
        }
        
        print(f"\n✓ Provisioning complete!")
        print(f"  URL: {sprite_url}")
        
        return result

def process_queue():
    """Process the provisioning queue."""
    queue_file = Path("/home/sprite/arcamatrix/provisioning_queue.json")
    results_file = Path("/home/sprite/arcamatrix/provisioning_results.json")
    
    if not queue_file.exists():
        print("No queue file found")
        return
    
    with open(queue_file) as f:
        queue = json.load(f)
    
    if not queue:
        print("Queue is empty")
        return
    
    provisioner = SpritesProvisioner()
    results = []
    
    for item in queue:
        result = provisioner.provision_customer(
            customer_email=item["customer_email"],
            skills=item["skills"],
            ticket_id=item["ticket_id"]
        )
        results.append(result)
    
    # Save results
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    
    # Clear processed items from queue
    with open(queue_file, "w") as f:
        json.dump([], f)
    
    print(f"\nProcessed {len(results)} items")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "process":
        process_queue()
    else:
        print("Usage: python sprites_provisioner.py process")
        print("  Processes the provisioning queue")
