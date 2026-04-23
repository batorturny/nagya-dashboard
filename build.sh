#!/usr/bin/env bash
# Assembles public/ — the directory consumed by the Worker's ASSETS binding.
# Prereq: `npm run build:ui` (Vite build of the React app into dist/client/).
set -euo pipefail

cd "$(dirname "$0")"

rm -rf public
mkdir -p public

# React SPA build output
if [ -d dist/client ]; then
  cp -r dist/client/. public/
else
  echo "dist/client missing — did you run 'npm run build:ui' first?" >&2
  exit 1
fi

# Product image CDN (per-SKU images)
if [ -d images ]; then
  cp -r images public/
fi

# Data snapshots — used by the React app as offline fallback
cp products.json users.json public/ 2>/dev/null || true

# Coupon booklet (print-to-PDF target linked from the emails)
cp coupon-booklet.html public/ 2>/dev/null || true
cp aldi-logo.png Aldi-logo.jpg public/ 2>/dev/null || true

file_count=$(find public -type f | wc -l | tr -d ' ')
echo "Built public/ with ${file_count} files."
