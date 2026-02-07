#!/usr/bin/env python3
"""
Linear Poller - Monitors Linear for PROVISIONING_REQUIRED tickets.
Part of Arcamatrix swarm orchestration.
"""

import json
import os
import time
import urllib.request
from datetime import datetime

LINEAR_API_KEY = os.environ.get("LINEAR_API_KEY", "")
TEAM_ID = "ba4087a8-ec66-41ae-a55f-b64c68cb2aed"
POLL_INTERVAL = 30

def query_linear(query: str, variables: dict = None) -> dict:
    """Execute a GraphQL query against Linear API."""
    url = "https://api.linear.app/graphql"
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    
    req = urllib.request.Request(url, data=data)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", LINEAR_API_KEY)
    
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def get_provisioning_tickets() -> list:
    """Fetch tickets with PROVISIONING_REQUIRED in title or description."""
    query = """
    query GetIssues($teamId: String!) {
        issues(filter: { 
            team: { id: { eq: $teamId } },
            state: { type: { nin: ["completed", "canceled"] } }
        }, first: 50) {
            nodes {
                id
                identifier
                title
                description
                state { name }
                createdAt
            }
        }
    }
    """
    result = query_linear(query, {"teamId": TEAM_ID})
    issues = result.get("data", {}).get("issues", {}).get("nodes", [])
    
    # Filter for provisioning requests
    provisioning = []
    for issue in issues:
        title = issue.get("title", "").upper()
        desc = issue.get("description", "").upper()
        if "PROVISIONING_REQUIRED" in title or "PROVISION" in title or "[PROVISION]" in title:
            provisioning.append(issue)
    
    return provisioning

def parse_ticket(ticket: dict) -> dict:
    """Parse customer info from ticket description."""
    desc = ticket.get("description", "")
    
    # Extract customer email
    customer_email = None
    for line in desc.split("\n"):
        if "email" in line.lower() and "@" in line:
            parts = line.split()
            for part in parts:
                if "@" in part:
                    customer_email = part.strip("*:,")
                    break
    
    # Extract skills
    skills = []
    in_skills_section = False
    for line in desc.split("\n"):
        if "skill" in line.lower() and ("select" in line.lower() or ":" in line):
            in_skills_section = True
            continue
        if in_skills_section and line.strip().startswith("-"):
            skill = line.strip().lstrip("-").strip()
            if skill:
                skills.append(skill)
        elif in_skills_section and line.strip() and not line.strip().startswith("-"):
            if "action" in line.lower() or "status" in line.lower():
                in_skills_section = False
    
    return {
        "ticket_id": ticket.get("identifier"),
        "customer_email": customer_email,
        "skills": skills,
        "raw": ticket
    }

def trigger_provisioning(parsed: dict):
    """Trigger the provisioning workflow."""
    print(f"[{datetime.utcnow().isoformat()}] PROVISIONING TRIGGERED")
    print(f"  Ticket: {parsed['ticket_id']}")
    print(f"  Customer: {parsed['customer_email']}")
    print(f"  Skills: {parsed['skills']}")

    # Import and call sprites_provisioner
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from sprites_provisioner import SpritesProvisioner

        provisioner = SpritesProvisioner()
        result = provisioner.provision_customer(
            customer_email=parsed['customer_email'],
            skills=parsed['skills'],
            ticket_id=parsed['ticket_id']
        )

        if result['success']:
            print(f"  ✓ Provisioning complete!")
            print(f"  Sprite URL: {result['sprite_url']}")

            # Save result to file
            results_file = "/home/sprite/arcamatrix/provisioning_results.json"
            try:
                with open(results_file, "r") as f:
                    results = json.load(f)
            except:
                results = []

            results.append(result)
            with open(results_file, "w") as f:
                json.dump(results, f, indent=2)
        else:
            print(f"  ✗ Provisioning failed: {result.get('error')}")
            # Fall back to queue file
            queue_file = "/home/sprite/arcamatrix/provisioning_queue.json"
            try:
                with open(queue_file, "r") as f:
                    queue = json.load(f)
            except:
                queue = []

            queue.append({
                "timestamp": datetime.utcnow().isoformat(),
                **parsed
            })

            with open(queue_file, "w") as f:
                json.dump(queue, f, indent=2)

    except Exception as e:
        print(f"  Error calling provisioner: {e}")
        # Fall back to queue file
        queue_file = "/home/sprite/arcamatrix/provisioning_queue.json"
        try:
            with open(queue_file, "r") as f:
                queue = json.load(f)
        except:
            queue = []

        queue.append({
            "timestamp": datetime.utcnow().isoformat(),
            **parsed
        })

        with open(queue_file, "w") as f:
            json.dump(queue, f, indent=2)

def main():
    print(f"[{datetime.utcnow().isoformat()}] Linear Poller started")
    print(f"  Team ID: {TEAM_ID}")
    print(f"  Poll interval: {POLL_INTERVAL}s")
    
    processed = set()
    
    while True:
        try:
            tickets = get_provisioning_tickets()
            print(f"[{datetime.utcnow().isoformat()}] Found {len(tickets)} provisioning tickets")
            
            for ticket in tickets:
                ticket_id = ticket.get("identifier")
                if ticket_id not in processed:
                    parsed = parse_ticket(ticket)
                    if parsed["customer_email"]:
                        trigger_provisioning(parsed)
                        processed.add(ticket_id)
                    else:
                        print(f"  Skipping {ticket_id}: no customer email found")
            
        except Exception as e:
            print(f"[{datetime.utcnow().isoformat()}] Error: {e}")
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
