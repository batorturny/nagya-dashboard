#!/usr/bin/env python3
"""Generate product images from products.json using Gemini 2.5 Flash Image.
Images are written to ./images/<sku>.png. Existing files are skipped.
"""
import base64
import json
import os
import pathlib
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
MODEL = "gemini-2.5-flash-image"
MAX_WORKERS = 3
MIN_VALID_BYTES = 10_000
MAX_RETRIES = 5


def load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"\'')
    print("ERROR: GEMINI_API_KEY not set (env or .env file).", file=sys.stderr)
    sys.exit(1)


API_KEY = load_api_key()
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(exist_ok=True)

products = json.loads((ROOT / "products.json").read_text())["data"]
total = len(products)
lock = threading.Lock()
done = 0


def build_prompt(p: dict) -> str:
    desc = p.get("description", "").split(".")[0][:220]
    return (
        f"Professional product photography of {p['title']}, category: {p['category']}. "
        f"{desc}. Clean white studio background, soft even lighting, centered composition, "
        f"photorealistic catalog e-commerce style, high detail, no text, no logos, no packaging branding."
    )


def call_api(prompt: str) -> bytes:
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }).encode()
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            cand = data.get("candidates", [])
            if not cand:
                raise RuntimeError(f"no candidates: {str(data)[:200]}")
            for part in cand[0].get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
            raise RuntimeError(f"no image part: {str(data)[:200]}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < MAX_RETRIES - 1:
                delay = min(60, (2 ** attempt) + random.uniform(0, 2))
                time.sleep(delay)
                continue
            detail = e.read().decode(errors="replace")[:300]
            raise RuntimeError(f"HTTP {e.code}: {detail}") from e
    raise RuntimeError("max retries exceeded")


def generate(p: dict) -> None:
    global done
    out = IMG_DIR / f"{p['sku']}.png"
    if out.exists() and out.stat().st_size > MIN_VALID_BYTES:
        with lock:
            done += 1
            print(f"[{done}/{total}] skip   {p['sku']}")
        return
    try:
        img = call_api(build_prompt(p))
        out.write_bytes(img)
        with lock:
            done += 1
            print(f"[{done}/{total}] OK     {p['sku']}  {p['title']}")
    except Exception as e:
        with lock:
            done += 1
            print(f"[{done}/{total}] ERROR  {p['sku']}: {e}", file=sys.stderr)


def main() -> None:
    print(f"Generating {total} images with {MODEL} ({MAX_WORKERS} workers)...")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        list(ex.map(generate, products))
    ok = len(list(IMG_DIR.glob("*.png")))
    print(f"Done. {ok}/{total} images in {IMG_DIR}")


if __name__ == "__main__":
    main()
