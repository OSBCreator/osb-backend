#!/usr/bin/env python3
"""
Asset exposure guard for Cloudflare Workers static-asset deployments.

wrangler.toml serves `directory = "./"`, so every tracked file is PUBLIC by
default. This script inverts that default.

Three independent checks run against the set of files that would actually be
served (tracked in git, not excluded by .assetsignore):

  1. ALLOWLIST   Only approved file types may be served. Anything else fails,
                 including file types nobody anticipated. This is what stops
                 a stray .csv, .xlsx, .bak or data dump reaching the web.

  2. DENYLIST    Some files carry an approved extension but must still never
                 be served — server-side .js, .env files, key material.

  3. SECRETS     Served text files are scanned for credential shapes.

A file must pass all three. Anything unrecognised fails closed.
"""

import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ASSETSIGNORE = Path(".assetsignore")

# ─────────────────────────────────────────────────────────────────────────
# 1. ALLOWLIST — the only extensions permitted in the public asset set.
#    Add deliberately. Everything absent from this set fails the build.
# ─────────────────────────────────────────────────────────────────────────
ALLOWED_SUFFIXES = {
    # markup / styles / behaviour
    ".html", ".htm", ".css", ".js", ".mjs", ".map",
    # images
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico",
    # fonts
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    # SEO / crawler files
    ".xml", ".txt", ".webmanifest",
    # media
    ".mp4", ".webm", ".mp3",
}

# Specific filenames allowed despite having no suffix or an odd one.
ALLOWED_EXACT = {
    "_headers",
    "_redirects",
    "LICENSE",
}

# ─────────────────────────────────────────────────────────────────────────
# 2. DENYLIST — dangerous even when the extension is allowed.
# ─────────────────────────────────────────────────────────────────────────
FORBIDDEN_PATTERNS = [
    (r"(^|/)[^/]*server[^/]*\.(js|mjs|ts)$", "server-side code"),
    (r"(^|/)\.env",                          "environment file"),
    (r"(^|/)[^/]*(secret|credential|passwd|password)[^/]*", "sensitive filename"),
    (r"(^|/)node_modules/",                  "dependency tree"),
    (r"(^|/)\.git",                          "git metadata"),
    (r"(^|/)\.DS_Store$",                    "macOS metadata"),
]

# ─────────────────────────────────────────────────────────────────────────
# 3. SECRETS — credential shapes that must never appear in a served file.
# ─────────────────────────────────────────────────────────────────────────
SECRET_PATTERNS = [
    (r"service_role",                                                 "Supabase service_role reference"),
    (r"sb_secret_[A-Za-z0-9_-]{10,}",                                 "Supabase secret key"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}", "JWT"),
    (r"re_[A-Za-z0-9]{20,}",                                          "Resend API key"),
    (r"sk-[A-Za-z0-9_-]{20,}",                                        "generic secret key"),
    (r"gh[pousr]_[A-Za-z0-9]{30,}",                                   "GitHub token"),
    (r"AIza[A-Za-z0-9_-]{30,}",                                       "Google API key"),
    (r"AKIA[0-9A-Z]{16}",                                             "AWS access key"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----",                           "private key block"),
]

SCANNABLE_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".css", ".txt", ".xml", ".svg"}


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

    all_files = tracked_files()
    served, failures = [], []

    for path in all_files:
        if is_excluded(path, rules):
            continue
        served.append(path)

        name = Path(path).name
        suffix = Path(path).suffix.lower()

        # Check 1 — allowlist. Fails closed on anything unrecognised.
        if name not in ALLOWED_EXACT and suffix not in ALLOWED_SUFFIXES:
            shown = suffix if suffix else "(no extension)"
            failures.append(
                f"NOT ALLOWED  {path}\n"
                f"             File type {shown} is not in the public allowlist.\n"
                f"             This file would be served at your domain.\n"
                f"             Fix: add it to .assetsignore, delete it, or — only\n"
                f"             if it is genuinely meant to be public — add the\n"
                f"             extension to ALLOWED_SUFFIXES."
            )
            continue

        # Check 2 — denylist for dangerous files wearing allowed extensions.
        for pattern, label in FORBIDDEN_PATTERNS:
            if re.search(pattern, path):
                failures.append(
                    f"FORBIDDEN    {path}\n"
                    f"             {label} must never be served publicly.\n"
                    f"             Fix: add it to .assetsignore, or delete it."
                )
                break

    # Check 3 — credential shapes in served text files.
    for path in served:
        if Path(path).suffix.lower() not in SCANNABLE_SUFFIXES:
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
                    f"SECRET       {path}:{line_no}\n"
                    f"             Possible {label} in a publicly served file."
                )
                break

    print(f"Tracked files:   {len(all_files)}")
    print(f"Publicly served: {len(served)}\n")

    if failures:
        print("\n\n".join(failures))
        print(f"\n{len(failures)} issue(s) found.")
        return 1

    print("PASS  Served asset set contains only approved file types,")
    print("      no server-side files, and no credentials.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
