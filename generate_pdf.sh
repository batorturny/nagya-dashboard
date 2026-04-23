#!/usr/bin/env bash
# Render coupon-booklet.html to coupon-booklet.pdf using headless Chrome.
# Usage: ./generate_pdf.sh [input.html] [output.pdf]
set -euo pipefail

cd "$(dirname "$0")"

INPUT="${1:-coupon-booklet.html}"
OUTPUT="${2:-coupon-booklet.pdf}"

CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome 2>/dev/null || true)" \
  "$(command -v chromium 2>/dev/null || true)" \
  "$(command -v chrome 2>/dev/null || true)"
do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    CHROME="$candidate"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "ERROR: no Chrome/Chromium binary found. Install one or set the path manually." >&2
  exit 1
fi

ABS_INPUT="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
ABS_OUTPUT="$(pwd)/$OUTPUT"

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --virtual-time-budget=15000 \
  --print-to-pdf="$ABS_OUTPUT" \
  --print-to-pdf-no-header \
  "file://$ABS_INPUT" 2>/dev/null

echo "PDF written: $ABS_OUTPUT ($(wc -c < "$ABS_OUTPUT" | tr -d ' ') bytes)"
