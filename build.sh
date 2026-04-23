#!/usr/bin/env bash
# Assembles the static public/ directory consumed by the Worker's assets binding.
# Run before `wrangler dev` or `wrangler deploy`.
set -euo pipefail

cd "$(dirname "$0")"

rm -rf public
mkdir -p public

# Team-member dashboard + data snapshots
cp index.html public/
cp products.json public/
cp users.json public/

# AI-generated product images (per SKU)
if [ -d images ]; then
  cp -r images public/
fi

# Optional: include other static files under public/ overrides here

file_count=$(find public -type f | wc -l | tr -d ' ')
echo "Built public/ with ${file_count} files."
