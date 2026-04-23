# Nagya API Dashboard

Visual dashboard for the `api.nagya.app` users and products endpoints, with AI-generated product images.

**Live demo:** see GitHub Pages link in the repo settings.

## Contents

- `index.html` — single-file dashboard (users + products with filtering)
- `users.json` / `products.json` — embedded data snapshots from the API
- `images/<sku>.png` — 76 AI-generated product photos (1024×1024)
- `generate_images.py` — regenerate images via Gemini 2.5 Flash Image
- `refresh.sh` — refetch JSON from the API and inline into `index.html`

## Why inline JSON

The API only allows CORS from `https://nagya.app`, so `file://` and third-party origins cannot fetch directly. `refresh.sh` fetches once and inlines the payload into `index.html` as `window.__API__`, making the dashboard work everywhere (offline, static hosting, file://).

## Regenerate images

```bash
cp .env.example .env
# edit .env and set GEMINI_API_KEY=...
python3 generate_images.py
```

Uses `gemini-2.5-flash-image` (Nano Banana). Existing images are skipped.

## Refresh data

```bash
./refresh.sh
```

Fetches `/users` and `/products`, embeds into `index.html`.
