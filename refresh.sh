#!/usr/bin/env bash
# Refresh local JSON snapshots from the Nagya API.
# Run this whenever you want fresh data. The index.html reads these files
# via a local server (see README) or uses them as embedded fallback.
set -euo pipefail

cd "$(dirname "$0")"

echo "Fetching users..."
curl -sf https://api.nagya.app/users -o users.json
echo "  $(wc -c < users.json | tr -d ' ') bytes"

echo "Fetching products..."
curl -sf https://api.nagya.app/products -o products.json
echo "  $(wc -c < products.json | tr -d ' ') bytes"

# Inline the JSON into index.html so it works from file:// (no CORS needed).
python3 - <<'PY'
import json, re, pathlib
root = pathlib.Path(__file__).parent if '__file__' in dir() else pathlib.Path('.')
users = json.loads(pathlib.Path('users.json').read_text())
products = json.loads(pathlib.Path('products.json').read_text())
html = pathlib.Path('index.html').read_text()
payload = f"<script id=\"api-data\">window.__API__ = {json.dumps({'users': users, 'products': products}, ensure_ascii=False)};</script>"
new_html, n = re.subn(r'<script id="api-data">.*?</script>', payload, html, count=1, flags=re.DOTALL)
if n == 0:
    new_html = html.replace('</head>', payload + '\n</head>', 1)
pathlib.Path('index.html').write_text(new_html)
print(f"Embedded {users['count']} users and {products['count']} products into index.html")
PY

echo "Done. Open index.html in the browser."
