#!/usr/bin/env python3
"""
Gatekeeper - Security wrapper for CLAWDBOT commands.
Validates all commands before execution, blocks dangerous operations.
"""

import json
import re
import os
import shlex
import subprocess
from pathlib import Path
from datetime import datetime

CONFIG_PATH = Path("/home/sprite/arcamatrix/config/safety_rules.json")
LOG_PATH = Path("/home/sprite/arcamatrix/logs/gatekeeper.log")

class Gatekeeper:
    def __init__(self):
        self.rules = self._load_rules()
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    def _load_rules(self) -> dict:
        """Load safety rules from config."""
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH) as f:
                return json.load(f)
        return self._default_rules()
    
    def _default_rules(self) -> dict:
        """Default safety rules if no config exists."""
        return {
            "blocked_paths": [
                "/etc",
                "/var",
                "/usr",
                "/bin",
                "/sbin",
                "/root",
                "~/.ssh",
                "~/.gnupg",
                "~/.aws",
                "~/.config/gcloud",
                "/home/sprite/.claude",
                "/home/sprite/.openclaw/skills_config.json"
            ],
            "blocked_commands": [
                "rm -rf /",
                "rm -rf /*",
                "dd if=",
                "mkfs",
                "chmod 777",
                "curl.*|.*sh",
                "wget.*|.*sh",
                "nc -e",
                "bash -i",
                "python -c.*socket",
                "eval(",
                "exec(",
                "> /dev/sd",
                "shutdown",
                "reboot",
                "init 0",
                "kill -9 1",
                "pkill",
                "killall"
            ],
            "blocked_patterns": [
                r".*\.\.\/.*\.\.\/.*",  # Path traversal
                r";\s*rm\s",             # Command injection with rm
                r"\|\s*sh",              # Pipe to shell
                r"`.*`",                 # Backtick execution
                r"\$\(.*\)",             # Command substitution
            ],
            "allowed_paths": [
                "/home/sprite/workspace",
                "/home/sprite/customer",
                "/tmp"
            ],
            "max_command_length": 10000,
            "log_all_commands": True
        }
    
    def _log(self, level: str, message: str, command: str = None):
        """Log an event."""
        timestamp = datetime.utcnow().isoformat()
        entry = f"[{timestamp}] [{level}] {message}"
        if command:
            entry += f" | Command: {command[:200]}"
        
        with open(LOG_PATH, "a") as f:
            f.write(entry + "\n")
        
        if level in ["BLOCKED", "ERROR"]:
            print(f"GATEKEEPER {level}: {message}")
    
    def _expand_path(self, path: str) -> str:
        """Expand ~ and environment variables."""
        return os.path.expanduser(os.path.expandvars(path))
    
    def _check_path_access(self, command: str) -> tuple[bool, str]:
        """Check if command accesses blocked paths."""
        for blocked in self.rules.get("blocked_paths", []):
            expanded = self._expand_path(blocked)
            if expanded in command or blocked in command:
                return False, f"Access to {blocked} is blocked"
        return True, ""
    
    def _check_blocked_commands(self, command: str) -> tuple[bool, str]:
        """Check for explicitly blocked commands."""
        cmd_lower = command.lower()
        for blocked in self.rules.get("blocked_commands", []):
            if blocked.lower() in cmd_lower:
                return False, f"Command pattern '{blocked}' is blocked"
        return True, ""
    
    def _check_patterns(self, command: str) -> tuple[bool, str]:
        """Check for dangerous patterns."""
        for pattern in self.rules.get("blocked_patterns", []):
            if re.search(pattern, command, re.IGNORECASE):
                return False, f"Dangerous pattern detected"
        return True, ""
    
    def _check_length(self, command: str) -> tuple[bool, str]:
        """Check command length."""
        max_len = self.rules.get("max_command_length", 10000)
        if len(command) > max_len:
            return False, f"Command too long ({len(command)} > {max_len})"
        return True, ""
    
    def validate(self, command: str) -> tuple[bool, str]:
        """Validate a command against all rules."""
        # Length check
        ok, msg = self._check_length(command)
        if not ok:
            self._log("BLOCKED", msg, command)
            return False, msg
        
        # Path access check
        ok, msg = self._check_path_access(command)
        if not ok:
            self._log("BLOCKED", msg, command)
            return False, msg
        
        # Blocked commands check
        ok, msg = self._check_blocked_commands(command)
        if not ok:
            self._log("BLOCKED", msg, command)
            return False, msg
        
        # Pattern check
        ok, msg = self._check_patterns(command)
        if not ok:
            self._log("BLOCKED", msg, command)
            return False, msg
        
        # All checks passed
        if self.rules.get("log_all_commands"):
            self._log("ALLOWED", "Command validated", command)
        
        return True, "OK"
    
    def execute(self, command: str, timeout: int = 30) -> dict:
        """Validate and execute a command."""
        ok, msg = self.validate(command)
        
        if not ok:
            return {
                "success": False,
                "blocked": True,
                "reason": msg,
                "stdout": "",
                "stderr": f"GATEKEEPER: {msg}"
            }
        
        try:
            # Use shlex.split to safely parse command instead of shell=True
            cmd_parts = shlex.split(command)
            result = subprocess.run(
                cmd_parts,
                shell=False,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd="/home/sprite/workspace"
            )
            return {
                "success": result.returncode == 0,
                "blocked": False,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            self._log("ERROR", f"Command timed out after {timeout}s", command)
            return {
                "success": False,
                "blocked": False,
                "reason": "timeout",
                "stdout": "",
                "stderr": f"Command timed out after {timeout}s"
            }
        except Exception as e:
            self._log("ERROR", str(e), command)
            return {
                "success": False,
                "blocked": False,
                "reason": str(e),
                "stdout": "",
                "stderr": str(e)
            }


# CLI interface
if __name__ == "__main__":
    import sys
    
    gatekeeper = Gatekeeper()
    
    if len(sys.argv) < 2:
        print("Usage: gatekeeper.py <command>")
        print("       gatekeeper.py --validate <command>")
        sys.exit(1)
    
    if sys.argv[1] == "--validate":
        command = " ".join(sys.argv[2:])
        ok, msg = gatekeeper.validate(command)
        print(f"Valid: {ok}")
        print(f"Message: {msg}")
        sys.exit(0 if ok else 1)
    else:
        command = " ".join(sys.argv[1:])
        result = gatekeeper.execute(command)
        print(result.get("stdout", ""))
        if result.get("stderr"):
            print(result["stderr"], file=sys.stderr)
        sys.exit(0 if result["success"] else 1)
