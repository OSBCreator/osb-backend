#!/usr/bin/env python3
"""
Asset exposure guard for Cloudflare Workers static-asset deployments.

Fails the build if a file that must never be publicly served would be
uploaded as a static asset — i.e. it is tracked in git and is NOT excluded
by .assetsignore.

Rationale: wrangler.toml serves `directory = "./"`, so the default state of
any new file is PUBLIC. This inverts that default for dangerous file types.
"""

import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ASSETSIGNORE = Path(".assetsignore")

# Files that must never be reachable over HTTP.
FORBIDDEN_PATTERNS = [
    (r"\.sql$",                 "database schema"),
    (r"\.toml$",                "deployment config"),
    (r"\.ya?ml$",               "config / workflow"),
    (r"(^|/)\.env",             "environment file"),
    (r"\.(pem|key|p12|pfx)$",   "private key material"),
    (r"(^|/)package(-lock)?\.json$", "node manifest"),
    (r"(^|/)[^/]*server[^/]*\.(js|ts|mjs|cjs)$", "server-side code"),
    (r"(^|/)[^/]*(secret|credential)[^/]*",      "suspicious filename"),
    (r"(^|/)\.DS_Store$",       "macOS metadata"),
    (r"(^|/)node_modules/",     "dependency tree"),
    (r"(^|/)\.git",             "git metadata"),
]

# Credential shapes that must never appear in a served file.
SECRET_PATTERNS = [
    (r"service_role",                              "Supabase service_role reference"),
    (r"sb_secret_[A-Za-z0-9_-]{10,}",              "Supabase secret key"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}", "JWT"),
    (r"re_[A-Za-z0-9]{20,}",                       "Resend API key"),
    (r"sk-[A-Za-z0-9_-]{20,}",                     "generic secret key"),
    (r"ghp_[A-Za-z0-9]{30,}",                      "GitHub token"),
]

TEXT_SUFFIXES = {".html", ".js", ".css", ".json", ".txt", ".xml", ".md", ".svg"}


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    ).stdout
    return [line for line in out.splitlines() if line.strip()]


def load_ignore_rules():
    if not ASSETSIGNORE.exists():
        return None
    rules = []
    for raw in ASSETSIGNORE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        rules.append(line)
    return rules


def is_excluded(path, rules):
    """Approximate .assetsignore (gitignore) matching."""
    for rule in rules:
        pattern = rule.rstrip("/")
        if fnmatch.fnmatch(path, pattern):
            return True
        if fnmatch.fnmatch(Path(path).name, pattern):
            return True
        # directory rule: everything beneath it
        if rule.endswith("/") and path.startswith(pattern + "/"):
            return True
        if path.startswith(pattern + "/"):
            return True
    return False


def main():
    rules = load_ignore_rules()
    if rules is None:
        print("FAIL  .assetsignore is missing.")
        print("      wrangler.toml serves the repository root, so without this")
        print("      file every tracked file is published.")
        return 1

    served, failures = [], []

    for path in tracked_files():
        if is_excluded(path, rules):
            continue
        served.append(path)
        for pattern, label in FORBIDDEN_PATTERNS:
            if re.search(pattern, path):
                failures.append(
                    f"EXPOSED  {path}\n"
                    f"         {label} would be served publicly.\n"
                    f"         Fix: add it to .assetsignore, or delete it."
                )
                break

    # Scan served text files for credential shapes.
    for path in served:
        if Path(path).suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            body = Path(path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern, label in SECRET_PATTERNS:
            m = re.search(pattern, body)
            if m:
                line_no = body[: m.start()].count("\n") + 1
                failures.append(
                    f"SECRET   {path}:{line_no}\n"
                    f"         Possible {label} in a publicly served file."
                )
                break

    print(f"Scanned {len(tracked_files())} tracked files.")
    print(f"{len(served)} would be served publicly.\n")

    if failures:
        print("\n\n".join(failures))
        print(f"\n{len(failures)} issue(s) found.")
        return 1

    print("PASS  No server-side files or credentials in the served asset set.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
