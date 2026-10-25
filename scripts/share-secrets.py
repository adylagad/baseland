#!/usr/bin/env python3
"""Copy apps/engine/.env into Supabase Vault for teammates.

Stores the engine's environment as the Vault secret `baseland_engine_env`
(created or updated) through the service-role-only RPC put_team_secret
(migration team_secrets_writer). Values are read from the file and sent
straight to Supabase; nothing is printed. Run from the repo root after
changing a key:

    python3 -I scripts/share-secrets.py

Teammates read it in the Supabase SQL editor; see the root README.
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CREDENTIALS_SECRET", "ANTHROPIC_API_KEY"]

path = pathlib.Path("apps/engine/.env")
if not path.exists():
    sys.exit("run from the repo root, with apps/engine/.env present")
env = dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line and not line.startswith("#"))
missing = [k for k in KEYS if not env.get(k, "").strip()]
if missing:
    sys.exit(f"apps/engine/.env is missing: {', '.join(missing)}")

body = (
    "# Baseland engine .env, shared via Supabase Vault (secret baseland_engine_env).\n"
    "# Save as apps/engine/.env. Never commit it.\n"
    + "".join(f"{k}={env[k].strip()}\n" for k in KEYS)
)
url, service = env["SUPABASE_URL"].strip(), env["SUPABASE_SERVICE_ROLE_KEY"].strip()
req = urllib.request.Request(
    f"{url}/rest/v1/rpc/put_team_secret",
    method="POST",
    data=json.dumps({
        "p_name": "baseland_engine_env",
        "p_secret": body,
        "p_description": "Complete apps/engine/.env for running the engine locally (Anthropic, Supabase service role, credentials secret).",
    }).encode(),
    headers={"apikey": service, "Authorization": f"Bearer {service}", "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"baseland_engine_env stored ({len(KEYS)} keys), HTTP {r.status}")
except urllib.error.HTTPError as e:
    sys.exit(f"Supabase refused: HTTP {e.code}")
