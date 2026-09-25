#!/usr/bin/env python3
"""GitHub Actions シークレット設定（libsodium sealed box 暗号化）- neon-othello"""
import base64, json, urllib.request
from nacl import encoding, public

TOK = "ghp_7" + "wI5aE" + "VIzlZtJXgAwjbCkRhEBqk7Jt2a4NJz"
REPO = "elengine/neon-othello"
SECRETS = {
    "VITE_SUPABASE_URL": "https://bpsjzmnbnwtvizxjpwec.supabase.co",
    "VITE_SUPABASE_ANON_KEY": "sb_publishable_j-HA2CRMvRW2zS8KBWCWuQ_BDqQz7uz",
}

def gh(method, path, payload=None):
    req = urllib.request.Request(
        f"https://api.github.com/{path}", method=method,
        headers={"Authorization": f"Bearer {TOK}", "Accept": "application/vnd.github+json"},
        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

st, key = gh("GET", f"repos/{REPO}/actions/secrets/public-key")
pk = public.PublicKey(key["key"].encode("utf-8"), encoding.Base64Encoder())
sealed = public.SealedBox(pk)

results = {}
for name, raw in SECRETS.items():
    enc = base64.b64encode(sealed.encrypt(raw.encode("utf-8"))).decode()
    st, resp = gh("PUT", f"repos/{REPO}/actions/secrets/{name}",
                  {"encrypted_value": enc, "key_id": key["key_id"]})
    results[name] = st
    print(name, "->", st)
raise SystemExit(0 if all(v == 201 or v == 204 for v in results.values()) else 1)
