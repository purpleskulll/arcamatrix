#!/usr/bin/env python3
"""
Sprite Pool Manager - Manages pre-created sprites for customer assignment.
"""
import json
from pathlib import Path
from datetime import datetime, timezone

POOL_FILE = Path("/home/sprite/blackboard/sprite_pool.json")

class SpritePool:
    def __init__(self):
        self.pool_file = POOL_FILE
        self._ensure_pool_file()

    def _ensure_pool_file(self):
        self.pool_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.pool_file.exists():
            initial = {"sprites": {}, "assignments": {}}
            for i in range(1, 11):
                name = f"arca-customer-{i:03d}"
                initial["sprites"][name] = {
                    "status": "available",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "sprite_url": f"https://{name}.bl4yi.sprites.app"
                }
            self._save(initial)

    def _load(self):
        with open(self.pool_file, 'r') as f:
            return json.load(f)

    def _save(self, data):
        with open(self.pool_file, 'w') as f:
            json.dump(data, f, indent=2)

    def assign_sprite(self, username, customer_email, customer_name):
        data = self._load()
        for sprite_name, info in data["sprites"].items():
            if info["status"] == "available":
                info["status"] = "assigned"
                info["assigned_to"] = username
                info["customer_email"] = customer_email
                info["customer_name"] = customer_name
                info["assigned_at"] = datetime.now(timezone.utc).isoformat()
                data["assignments"][username] = sprite_name
                self._save(data)
                return {"sprite_name": sprite_name, "sprite_url": info["sprite_url"]}
        return None

    def release_sprite(self, username):
        data = self._load()
        if username not in data["assignments"]:
            return False
        sprite_name = data["assignments"][username]
        if sprite_name in data["sprites"]:
            data["sprites"][sprite_name]["status"] = "available"
            for key in ["assigned_to", "customer_email", "customer_name", "assigned_at"]:
                data["sprites"][sprite_name].pop(key, None)
        del data["assignments"][username]
        self._save(data)
        return True

    def get_pool_status(self):
        data = self._load()
        available = sum(1 for s in data["sprites"].values() if s["status"] == "available")
        assigned = sum(1 for s in data["sprites"].values() if s["status"] == "assigned")
        total = len(data["sprites"])
        return {"total": total, "available": available, "assigned": assigned, "needs_expansion": available < 2}

    def get_customer_sprite(self, username):
        data = self._load()
        if username not in data["assignments"]:
            return None
        sprite_name = data["assignments"][username]
        return {"sprite_name": sprite_name, "sprite_url": data["sprites"][sprite_name]["sprite_url"]}

    def add_sprite_to_pool(self, sprite_name, sprite_url):
        data = self._load()
        data["sprites"][sprite_name] = {
            "status": "available",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sprite_url": sprite_url
        }
        self._save(data)