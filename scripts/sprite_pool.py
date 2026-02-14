#!/usr/bin/env python3
"""
Sprite Pool Manager - Manages pre-created sprites for customer assignment.
Uses fcntl file locking to prevent race conditions on concurrent access.
"""
import json
import fcntl
import tempfile
import os
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
                    "sprite_url": f"https://{name}-bl4yi.sprites.app"
                }
            self._save_atomic(initial)

    def _load_locked(self, fd):
        """Load JSON from an already-locked file descriptor."""
        fd.seek(0)
        content = fd.read()
        if not content:
            return {"sprites": {}, "assignments": {}}
        return json.loads(content)

    def _save_locked(self, fd, data):
        """Write JSON to an already-locked file descriptor (truncate + write)."""
        fd.seek(0)
        fd.truncate()
        fd.write(json.dumps(data, indent=2))
        fd.flush()
        os.fsync(fd.fileno())

    def _save_atomic(self, data):
        """Atomic save for initialization (no lock held yet)."""
        tmp = self.pool_file.with_suffix('.tmp')
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.rename(str(tmp), str(self.pool_file))

    def _load(self):
        """Unlocked read for status queries."""
        with open(self.pool_file, 'r') as f:
            return json.load(f)

    def _heal(self, data):
        """Sync assignments dict with sprite entries to prevent desync."""
        actual = {}
        for sname, info in data["sprites"].items():
            if info.get("status") == "assigned" and info.get("assigned_to"):
                actual[info["assigned_to"]] = sname
        to_remove = [u for u in data.get("assignments", {}) if u not in actual]
        for u in to_remove:
            del data["assignments"][u]
        for username, sname in actual.items():
            data["assignments"][username] = sname
        return data

    def assign_sprite(self, username, customer_email, customer_name):
        """Assign an available sprite to a customer. File-locked + duplicate check."""
        with open(self.pool_file, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                data = self._load_locked(f)
                data = self._heal(data)
                if username in data.get("assignments", {}):
                    existing = data["assignments"][username]
                    if existing in data["sprites"]:
                        return {"sprite_name": existing, "sprite_url": data["sprites"][existing]["sprite_url"]}
                for sprite_name, info in data["sprites"].items():
                    if info["status"] == "available":
                        info["status"] = "assigned"
                        info["assigned_to"] = username
                        info["customer_email"] = customer_email
                        info["customer_name"] = customer_name
                        info["assigned_at"] = datetime.now(timezone.utc).isoformat()
                        data.setdefault("assignments", {})[username] = sprite_name
                        self._save_locked(f, data)
                        return {"sprite_name": sprite_name, "sprite_url": info["sprite_url"]}
                return None
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def release_sprite(self, username):
        """Release a sprite back to the pool. File-locked."""
        with open(self.pool_file, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                data = self._load_locked(f)
                data = self._heal(data)
                if username not in data.get("assignments", {}):
                    return False
                sprite_name = data["assignments"][username]
                if sprite_name in data["sprites"]:
                    data["sprites"][sprite_name]["status"] = "available"
                    for key in ["assigned_to", "customer_email", "customer_name", "assigned_at"]:
                        data["sprites"][sprite_name].pop(key, None)
                del data["assignments"][username]
                self._save_locked(f, data)
                return True
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def get_pool_status(self):
        data = self._load()
        available = sum(1 for s in data["sprites"].values() if s["status"] == "available")
        assigned = sum(1 for s in data["sprites"].values() if s["status"] == "assigned")
        total = len(data["sprites"])
        return {"total": total, "available": available, "assigned": assigned,
                "needs_expansion": available < 3}

    def get_customer_sprite(self, username):
        data = self._load()
        if username not in data.get("assignments", {}):
            for sname, info in data["sprites"].items():
                if info.get("assigned_to") == username and info.get("status") == "assigned":
                    return {"sprite_name": sname, "sprite_url": info["sprite_url"]}
            return None
        sprite_name = data["assignments"][username]
        if sprite_name not in data["sprites"]:
            return None
        return {"sprite_name": sprite_name, "sprite_url": data["sprites"][sprite_name]["sprite_url"]}

    def add_sprite_to_pool(self, sprite_name, sprite_url):
        """Add a new sprite to the pool. File-locked."""
        with open(self.pool_file, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                data = self._load_locked(f)
                data["sprites"][sprite_name] = {
                    "status": "available",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "sprite_url": sprite_url
                }
                self._save_locked(f, data)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def mark_unreachable(self, sprite_name):
        """Mark a sprite as unreachable."""
        with open(self.pool_file, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                data = self._load_locked(f)
                if sprite_name in data["sprites"]:
                    data["sprites"][sprite_name]["status"] = "unreachable"
                    data["sprites"][sprite_name]["unreachable_since"] = datetime.now(timezone.utc).isoformat()
                    self._save_locked(f, data)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def try_recover_unreachable(self, sprite_name):
        """Try to mark an unreachable sprite as available again."""
        with open(self.pool_file, 'r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                data = self._load_locked(f)
                if sprite_name in data["sprites"] and data["sprites"][sprite_name]["status"] == "unreachable":
                    data["sprites"][sprite_name]["status"] = "available"
                    data["sprites"][sprite_name].pop("unreachable_since", None)
                    self._save_locked(f, data)
                    return True
                return False
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)