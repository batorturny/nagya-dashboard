# nagya.app — Smart Newsletter Platform

**Verzió:** 0.2 (PRD draft)
**Dátum:** 2026-04-23
**Forrás:** `docs/trans/transcript.txt` (hangjegyzet alapján)
**API docs:** https://nagya.app/aiklub/api_desc/ (csak /products-ot részletezi)

---

## ✅ Primary Goal (non-negotiable)

**Minden user email címére MUST kimennie egy emailnek.** 5 tesztuser → 5 email → 5 delivery. Ez a demo kritikus kimenete, minden más feature ezt szolgálja. Ha egy kimenetel rendszeres (nem demo), akkor minden aktív userhez minden kampánynál kell küldeni, szűrés az email TARTALMÁN történik (mit lát a user), nem az email TÉNYÉN.

---

## API referencia (live)

Base: `api.nagya.app`

**Products (read-only):**
- `GET /products` — all, sorted by category + title
- `GET /products/{id}` — one by ID vagy SKU
- `GET /products?category={name}` — filter
- `GET /products?sort={sold|expiry|price|name}` — sort
- `GET /products?search={term}` — full-text (title + description + SKU)
- `GET /products?deposit=true` — csak üvegdíjasok

**Users (részletek hiányosak, saját reverse-engineering alapján):**
- `GET /users`
- `GET /users/{id}`

Nincs POST/PUT/DELETE dokumentálva → minden mutation (tagek, kampányok) a **saját KV-nkben** tárolódik.

---

## 1. Vision

Egy olyan **admin webapp**, ahol a boltos (nagya.app) a termékkészletéhez könnyen össze tud állítani **személyre szabott, időjárás- és szezon-érzékeny email hírleveleket**, amelyek vonalkódos PDF kupont is tartalmaznak. A termékeket egyszer kell AI-val vagy kézzel felcímkézni, onnantól a rendszer magától javasolja, mit küldjünk kinek.

Röviden: **"Állítsd össze 3 kattintással a heti hírlevelet, a rendszer tudja, kinek melyik termék megy."**

---

## 2. Target user (admin)

**Elsődleges:** a nagya.app tulajdonosa/marketingese, aki termékeket árul és email-lista alapján promóz. Nem fejlesztő, de ért az alap UI-hoz.

**Végfelhasználó (email címzett):** a bolt vásárlója, aki email címet adott meg és preferenciákat jelzett (kedvenc kategória, kerülendő kategória). Jelenleg 5 tesztuser: `aiishackaton+1..5@gmail.com`.

---

## 3. Problem we solve

- A boltos kézzel nem tud 100+ termék és N user mátrixából naponta relevánsan válogatni.
- Statikus hírlevelek nem veszik figyelembe az **időjárást** (pl. nyár/eső) és a **lejárati urgencia**-t.
- Két egymást **helyettesítő termék** egy emailben rontja a CTR-t.
- **Egyszerre kell** personalizálni és kupon-ösztönzést adni → külön eszközök helyett egyben.

---

## 4. Core user flows

### 4.1 Termék-feltöltés / tagelés
1. Admin megnyitja a `/products` oldalt.
2. Látja a 76 terméket listában, szűrhető kategória + tag szerint.
3. Kattint "AI címkézés" gombra → háttérben Gemini 2.0 Flash lefut, minden termékre 4 tag-et javasol.
4. Admin átnézheti és manuálisan felülbírálja a tageket.
5. Tagek perzisztensek (KV / JSON blob).

### 4.2 Hírlevél-composer
1. Admin megnyitja a `/compose` oldalt.
2. Felső sávban választ kampány-típust: `Heti`, `Lejáratakció`, `Időjárás-tipp`, `Szezon-nyitó`.
3. Rendszer lekéri az aktuális és 7-napos AccuWeather forecastot.
4. A választott típus + időjárás + lejárat alapján javasol N terméket (1-10, admin állítja).
5. Admin hozzáadhat / törölhet termékeket a composerben, konfliktusokat (helyettesítő párok) a UI kiemeli.
6. Email preview látszik élőben.

### 4.3 Személyre szabás
1. "Küldés" előtt a rendszer minden userre lefuttat egy filter-t:
   - Ha a user `least_purchased_category`-ba esik egy termék → kivesszük.
   - Ha helyettesítő pár mindkét tagja bent van → a user `favorite_category`-hoz közelebbit hagyjuk.
   - Ha a user `favorite_category`-ba esik egy urgens termék → pinneljük az elejére.
2. A lista minden usernél más lehet, de ugyanabból a composer-sablonból dolgozunk.

### 4.4 Küldés + PDF
1. Admin: "Küldés" → confirm dialog (5 címzett, X termék).
2. Rendszer minden usernek:
   - Generálja a HTML-t (JSON-substitution template).
   - Csatolja / beágyazza a PDF kupon-lapot (vonalkód + kód + %).
   - Resend API hívja, 5 email megy ki.
3. Status visszajelzés usernként (sent / failed).

---

## 5. Feature requirements (prioritizált)

### P0 (must have — demo)
- **F1:** Termék-lista UI, kategória + tag szűrés
- **F2:** AI-alapú termék-tagelés (Gemini 2.0 Flash via OpenRouter)
- **F3:** Tag perzisztálás (JSON blob vagy Cloudflare KV)
- **F4:** Időjárás widget (AccuWeather API, fallback Open-Meteo)
- **F5:** Email composer UI: típus-választó, termék-lista (1-10), preview
- **F6:** Személyre szabás: `favorite`/`least_purchased` + helyettesítő-dedup
- **F7:** Resend email küldés (HTML + PDF csatolás vagy URL)
- **F8:** Vonalkódos PDF kupon (Code128, per-email vagy per-termék)
- **F9:** Discount ladder lejárat szerint (3d highlight, 2d = 20%, 1d = 50%)
- **F10:** Confirm dialog + küldés-status UI

### P1 (nice to have — ha van idő)
- **F11:** Termék-képek (Cloudflare CDN)
- **F12:** Email-kampány mentés / előzmény
- **F13:** Dry-run (preview mode, nem küld)

### P2 (future — scope-on kívül)
- **F14:** Cron-alapú automatikus napi/heti küldés
- **F15:** Click/open tracking dashboard
- **F16:** A/B variáns
- **F17:** Unsubscribe flow (GDPR)
- **F18:** Kupon-beváltás tracking (POS integráció)

---

## 6. Data model

### 6.1 Termék (meglévő — read-only az `api.nagya.app`-on)
```ts
Product {
  id: number
  sku: string
  title: string
  category: string           // eredeti kategória (11 db)
  description: string
  nutrition: string
  allergens: string[]
  expiration_date: string    // ISO date
  price: { value, cost_price, bottle_deposit }
  stock: { current, last_7_day_sold }
}
```

### 6.2 Tag (új — saját store)
Saját KV / blob. Kulcs: `sku`. Érték:
```ts
ProductTags {
  season: ('tavasz'|'nyár'|'ősz'|'tél'|'évszak-független')[]
  weather: ('meleg'|'hideg'|'esős'|'napos'|'időjárás-független')[]
  occasion: ('grill'|'reggeli'|'party'|'hétköznapi'|'ünnep'|'snack')[]
  pair_with: string[]        // SKUs that complement (grill + faszén)
  pair_conflict: string[]    // SKUs that substitute (2 féle chips)
  source: 'ai' | 'manual'
  updated_at: string
}
```

### 6.3 User (meglévő — `api.nagya.app/users`)
```ts
User {
  id: number
  name: string
  email: string
  favorite_category: string
  least_purchased_category: string
}
```

### 6.4 Kampány (új — saját store)
```ts
Campaign {
  id: string
  type: 'Heti'|'Lejáratakció'|'Időjárás'|'Szezon'|'Egyedi'
  products: string[]         // SKUs
  subject_template: string   // "{first_name}, {weather} - {title}"
  body_template: string      // HTML with {{product[N].*}} placeholders
  created_at: string
  sent_at?: string
  send_results?: SendResult[]
}
```

---

## 7. Technical architecture

### 7.1 Stack
- **Frontend:** **React 18 + TypeScript + Vite + Tailwind CSS v3 + shadcn/ui (new-york, zinc base)**, `lucide-react` ikonokhoz. A shadcn komponenseket `npx shadcn add <name>` parancsokkal húzzuk be. `@/*` path alias az `app/*`-ra.
- **Backend:** **Cloudflare Worker** (nem Pages Functions), **Hono** routerrel, assets binding-gel a Vite build-output kiszolgálásához
- **Storage:** **Cloudflare KV** (tags, campaigns) — gyors setup, nincs migráció. Később D1-re válthatunk ha komplex lekérdezés kell.
- **AI:** OpenRouter → Gemini 2.0 Flash (olcsó, magyar nyelv OK)
- **Email:** Resend API
- **Weather:** AccuWeather API (opcionális; fallback: Open-Meteo, ingyenes)
- **Barcode + PDF:** kliens-oldal, `jsbarcode` + `jspdf` npm packagek, vagy CDN-ről (a PDF-gen nem blokkol, külön komponens)
- **CDN:** A Worker `assets` binding-e szolgálja ki a Vite build-et és a `images/` CDN-t (Cloudflare automatikus)

### 7.1b Projekt-struktúra

```
/
├── app/                         React frontend (Vite root)
│   ├── index.html               Vite entry
│   ├── main.tsx                 React bootstrap
│   ├── App.tsx
│   ├── globals.css              Tailwind directives + shadcn CSS változók
│   ├── components/
│   │   └── ui/                  shadcn komponensek ide jönnek
│   ├── lib/utils.ts             shadcn `cn()` helper
│   └── pages/                   route-ok (Products, Compose, Send)
├── src/                         Worker backend
│   └── index.ts                 Hono app
├── public/                      Build output (gitignored; build.sh rakja össze)
├── dist/client/                 Vite output (gitignored)
├── images/                      Termék-képek (CDN-ként szolgálva)
├── index.html                   Team legacy dashboard (megmarad referenciaként, nem kerül ki)
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json              shadcn config
├── wrangler.jsonc               Worker config
├── build.sh                     vite build → public/ + images/ copy
└── tsconfig.json + tsconfig.app.json + tsconfig.worker.json
```

### 7.2 Architektúra ábra
```
                  ┌───────────────────────────────────────────┐
                  │      Cloudflare Worker (Hono)             │
                  │      name: nagya-dashboard                │
                  │      entry: src/index.ts                  │
                  │                                           │
Browser  ◀───▶    │  /               → assets binding         │
                  │                    (index.html, images,   │
                  │                     js, css → ./public)   │
                  │                                           │
                  │  /api/users      → proxy /users           │
                  │  /api/products   → proxy /products        │
                  │  /api/weather    → Open-Meteo/AccuWeather │
                  │  /api/tags       → KV TAGS                │
                  │  /api/tags/:sku  → KV TAGS (PUT)          │
                  │  /api/ai-tag     → OpenRouter Gemini      │
                  │  /api/campaigns  → KV CAMPAIGNS           │
                  │  /api/send       → Resend                 │
                  └──────────┬────────────────────────────────┘
                             │
                    ┌────────┴──────────┬──────────┐
                    ▼                   ▼          ▼
             KV: TAGS            KV: CAMPAIGNS   Secrets:
             KV: CAMPAIGNS                       RESEND_API_KEY
                                                 OPENROUTER_API_KEY
                                                 ACCUWEATHER_KEY (opt)
```

### 7.3 Endpoint lista
| Endpoint | Method | Cél |
|---|---|---|
| `/api/users` | GET | Proxy → `api.nagya.app/users`, CORS + cache |
| `/api/products` | GET | Proxy → `api.nagya.app/products` |
| `/api/weather` | GET | AccuWeather / Open-Meteo proxy |
| `/api/tags` | GET | Összes termék-tag visszaadás (KV dump) |
| `/api/tags/:sku` | PUT | Manuális tag override |
| `/api/ai-tag` | POST | Batch AI tagging (Gemini Flash); body: `{skus?}`; default: összes |
| `/api/campaigns` | GET | Kampány-előzmény |
| `/api/campaigns` | POST | Új kampány mentés |
| `/api/send` | POST | Kiküldés; body: `{campaignId}` vagy inline `{products, users}` |
| `/api/coupon-pdf` | GET? | Opcionális szerver-oldali PDF (fallback) |

---

## 8. Roadmap — 4 fázisos hackathon szkópe

Minden fázis **külön commit-olható**, **külön deployolható**. Fázisonként ~30-90 perc reális.

### Phase 1 — Worker skeleton + live data
**Deliverable:** Cloudflare Worker él a `nagya-dashboard` néven, Hono routerrel, assets binding-gel kiszolgálja a meglévő `index.html`-t és a `images/`-t, két működő API endpoint proxyzza a live `/users` és `/products` adatot.
- `wrangler.jsonc` — Worker config, `main: src/index.ts`, `assets.directory: "./public"`
- `package.json` — `hono` + `wrangler` devDeps
- `src/index.ts` — Hono app: `/api/users`, `/api/products` proxy + CORS + in-memory 60s cache
- `public/` — ide kerül `index.html`, `products.json`, `users.json`, `images/` (build step másolja)
- `build.sh` — copy statikus fájlokat `public/`-ba
- KV namespace létrehozva: `TAGS`, `CAMPAIGNS` (csak bindingek, még üres)
- Deploy: Cloudflare dashboard → Workers → Git integration → repo connect → auto-deploy main push-ra
**Verifikáció:** `https://nagya-dashboard.<account>.workers.dev` megnyit, `index.html` live, `/api/users` 200-at ad a teszt adattal, `/api/products` 200, mindkettő friss data-val.

### Phase 2 — AI tagging pipeline
**Deliverable:** Termékek automatikusan megkapnak `season` / `weather` / `occasion` / `pair_with` / `pair_conflict` tageket, és tárolódnak KV-ban.
- `src/routes/ai-tag.ts` → OpenRouter → Gemini 2.0 Flash batch
  - Input: 76 termék title + description + category
  - Output: strukturált JSON tag-tömb, validálva kézi check-kel
- `src/routes/tags.ts` GET (all) / `:sku` PUT (manual override)
- KV secret: `OPENROUTER_API_KEY` beállítva
- UI: "AI címkézés" gomb a termék-oldalon, per-termék manuális override
**Verifikáció:** 76 termékre megjelenik 3-5 tag, "Grill kolbász" → `{occasion:['grill'], season:['tavasz','nyár'], weather:['napos','meleg'], pair_with:['GNF-001 Faszén']}`.

### Phase 3 — Composer + weather + personalization
**Deliverable:** Admin össze tud állítani egy kampányt, lát preview-t, időjárás-widget működik.
- `src/routes/weather.ts` → Open-Meteo (ha nincs AccuWeather key) vagy AccuWeather
- `public/compose.html` — composer UI:
  - Felső sáv: kampány-típus chipek
  - Javaslat-lista (tag + weather + expiry + urgency alapján)
  - Drag-to-remove / add-from-search
  - Konfliktus-jelölés (helyettesítő párok pirossal)
  - 1-10 slider
  - Live preview (HTML render)
- Discount ladder: daysLeft 1 → 50%, 2 → 20%, 3 → highlight
- Personalization preview: minden usernél más szelekció
**Verifikáció:** Admin kiválaszt "Lejáratakció" típust → javaslat megjelenik, preview-ban 5 user kártya a perszonalizált termékekkel.

### Phase 4 — Send + PDF coupon
**Deliverable:** Kampány elküldhető 5 usernek, mindegyik kap vonalkódos PDF kupont (csatolva vagy URL-en).
- `src/routes/send.ts` → Resend batch
  - HTML template inline CSS-sel, `{{product[N].title}}` substitution
  - Kuponkód determinisztikus: `NAGYA-{sku}-{hash(userId+sku)}`
  - Sender: `noreply@bildr.hu` (verified)
- Kliens-oldali PDF gen: `jsPDF` + `JsBarcode` (Code128), `public/lib/`-ben vagy CDN-ről
  - Toggle: per-email vs. per-termék PDF
- Küldés-flow:
  - Confirm dialog
  - POST /api/send
  - Status UI (5 zöld pipa vagy error)
- Secret: `RESEND_API_KEY` → `wrangler secret put` vagy Cloudflare dashboard
**Verifikáció:** 5 email megérkezik az `aiishackaton+*@gmail.com`-ra, PDF letölthető a linkről, barcode olvasható.

---

## 9. Open questions / döntések

| # | Kérdés | Javasolt default | Dönt eldöntve |
|---|---|---|---|
| Q1 | AccuWeather API key van-e? | Ha nincs → Open-Meteo (ingyenes) | ⏳ user |
| Q2 | Termék-képek hol vannak? | Nincsenek az API-ban → skip P1-ig, placeholder SVG | ⏳ user |
| Q3 | Helyettesítő párok forrása? | AI javaslat + manuális override | ⚠️ P2-ben AI, addig: kategória-alapú heurisztika (ugyanaz a category → substitute) |
| Q4 | KV vs. static JSON a tagekhez? | **KV** (mutable, nem kell redeploy) | ✅ KV |
| Q5 | 1-10 termék/email — default? | 5 | javaslat |
| Q6 | Email image hosting | Phase 4-ig nincs, utána Pages assets | javaslat |
| Q7 | Tag nyelv (magyar vs angol)? | **Magyar** (a UI magyar) | ✅ magyar |
| Q8 | Kampány-mentés kell Phase 4-be? | P1 feature, ki lehet hagyni demo-hoz | javaslat: halasztani |

---

## 10. Current state (mi kész)

- ✅ `dashboard.html` — statikus proof-of-concept 4-lépéses pipeline vizualizációval, deploy-olva `https://nagya-hirlevel.pages.dev`
- ✅ `products.json`, `users.json` — snapshot az API-ról
- ✅ Ranking / bundle / personalization logika prototípus (vanilla JS)
- ✅ Cloudflare Pages projekt létrehozva BILDR HUB account alatt
- ❌ AI tagging — nincs
- ❌ Composer UI — nincs
- ❌ KV storage — nincs
- ❌ Email küldés — nincs
- ❌ PDF kupon — nincs (csak CSS mock)

---

## 11. Out of scope (v0.1)

- Cron-alapú automatikus napi / heti küldés
- Session tracking, auth, több admin user
- Open / click tracking UI
- Unsubscribe + GDPR flow
- Kupon-beváltás trackelés (POS integráció)
- Multi-nyelvűség
- Termék-CRUD (az API read-only)
- Saját felhasználói regisztráció / login

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| AccuWeather kulcs nincs / lassú verifikáció | Open-Meteo fallback, nincs key |
| Gemini Flash hallucinál tag-et | Manuális override UI + kis termék-szám (76) → review könnyű |
| Resend test mode limit | `noreply@bildr.hu` verified → production-ready |
| KV eventual consistency | Hackathon scope-ban elfogadható |
| PDF kliens-oldali gen lassú nagy barcode-nál | Code128 egyszerű, gyors; per-email PDF max 10 barcode |

---

## Kapcsolódó dokumentumok

- Hangjegyzet transcript: `docs/trans/transcript.txt`
- Eredeti audio: `docs/trans/Új felvétel 29.m4a`
- Előző plan (superseded): `~/.claude/plans/mi-legyen-a-k-vetkez-generic-wren.md`
- Dashboard prototípus: `dashboard.html`
