import type { Context } from 'hono';
import type { Product, ProductTags } from '../lib/scoring';

interface Bindings {
  TAGS: KVNamespace;
  NAGYA_API_BASE: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
}

interface AiTagBody {
  skus?: string[];       // optional filter — if omitted, tag all products
  dryRun?: boolean;      // if true, return tags without persisting to KV
  batchSize?: number;    // products per AI call (default 10, max 20)
}

// Valid tag values — the AI must pick from these only
const VALID_SEASONS = ['tavasz', 'nyár', 'ősz', 'tél', 'évszak-független'] as const;
const VALID_WEATHER = ['meleg', 'hideg', 'esős', 'napos', 'időjárás-független'] as const;
const VALID_OCCASIONS = ['grill', 'reggeli', 'party', 'hétköznapi', 'ünnep', 'snack'] as const;

interface AiTagResult {
  sku: string;
  season: string[];
  weather: string[];
  occasion: string[];
  pair_with: string[];
  pair_conflict: string[];
}

// ---------------------------------------------------------------------------
// Build the prompt for a batch of products (with full SKU list for pairing)
// ---------------------------------------------------------------------------

function buildPrompt(batch: Product[], allSkus: { sku: string; title: string; category: string }[]): string {
  const skuRef = allSkus.map((s) => `${s.sku} (${s.title} — ${s.category})`).join('\n');

  const batchList = batch
    .map(
      (p) =>
        `- SKU: ${p.sku}\n  Title: ${p.title}\n  Category: ${p.category}\n  Description: ${p.description.slice(0, 200)}\n  Allergens: ${p.allergens.join(', ') || 'none'}`,
    )
    .join('\n\n');

  return `Te egy magyar szupermarket termékadatbázis-szakértő vagy. Az alábbi termékekhez adj strukturált címkéket.

## Szabályok
1. **season**: válassz 1-3 értéket ebből: ${VALID_SEASONS.join(', ')}
2. **weather**: válassz 1-2 értéket ebből: ${VALID_WEATHER.join(', ')}
3. **occasion**: válassz 1-3 értéket ebből: ${VALID_OCCASIONS.join(', ')}
4. **pair_with**: adj meg 1-3 SKU kódot, amelyek JÓL KIEGÉSZÍTIK ezt a terméket (pl. grillkolbász → faszén). CSAK az alábbi SKU listából válassz! NE a saját SKU-ját add meg.
5. **pair_conflict**: adj meg 0-2 SKU kódot, amelyek HELYETTESÍTIK ezt a terméket (pl. két féle kenyér). CSAK az alábbi SKU listából válassz!

## Elérhető SKU-k a pair_with és pair_conflict mezőkhöz:
${skuRef}

## Címkézendő termékek:
${batchList}

## Válaszformátum
Válaszolj KIZÁRÓLAG egy JSON tömbbel, semmi más szöveget ne adj hozzá:
[
  {
    "sku": "XXX-000",
    "season": ["..."],
    "weather": ["..."],
    "occasion": ["..."],
    "pair_with": ["SKU-1", "SKU-2"],
    "pair_conflict": ["SKU-3"]
  }
]`;
}

// ---------------------------------------------------------------------------
// Call OpenRouter (Gemini Flash)
// ---------------------------------------------------------------------------

async function callOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// Parse + validate AI response
// ---------------------------------------------------------------------------

function parseAndValidate(raw: string, validSkus: Set<string>): AiTagResult[] {
  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in AI response');

  const parsed = JSON.parse(jsonMatch[0]) as AiTagResult[];
  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  return parsed.map((item) => ({
    sku: item.sku,
    season: (item.season ?? []).filter((s) => (VALID_SEASONS as readonly string[]).includes(s)),
    weather: (item.weather ?? []).filter((w) => (VALID_WEATHER as readonly string[]).includes(w)),
    occasion: (item.occasion ?? []).filter((o) => (VALID_OCCASIONS as readonly string[]).includes(o)),
    pair_with: (item.pair_with ?? []).filter((s) => validSkus.has(s) && s !== item.sku),
    pair_conflict: (item.pair_conflict ?? []).filter((s) => validSkus.has(s) && s !== item.sku),
  }));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function aiTagHandler(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'OPENROUTER_API_KEY secret not configured' }, 500);
  }

  const body = (await c.req.json().catch(() => ({}))) as AiTagBody;
  const batchSize = Math.min(body.batchSize ?? 10, 20);

  // Fetch all products
  const prodRes = await fetch(`${c.env.NAGYA_API_BASE}/products`);
  if (!prodRes.ok) return c.json({ error: 'upstream_error' }, 502);
  const prodEnvelope = (await prodRes.json()) as { data: Product[] };
  const allProducts = prodEnvelope.data;

  // Filter to requested SKUs if provided
  const targets = body.skus
    ? allProducts.filter((p) => body.skus!.includes(p.sku))
    : allProducts;

  if (targets.length === 0) {
    return c.json({ error: 'no matching products', skus: body.skus }, 400);
  }

  // SKU reference for cross-product pairing
  const allSkuRef = allProducts.map((p) => ({
    sku: p.sku,
    title: p.title,
    category: p.category,
  }));
  const validSkus = new Set(allProducts.map((p) => p.sku));

  // Split into batches
  const batches: Product[][] = [];
  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize));
  }

  // Process batches sequentially (rate limit friendly; Gemini Flash is fast)
  const allResults: Array<AiTagResult & { error?: string }> = [];
  const errors: string[] = [];

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    try {
      const prompt = buildPrompt(batch, allSkuRef);
      const raw = await callOpenRouter(prompt, apiKey, c.env.OPENROUTER_MODEL);
      const validated = parseAndValidate(raw, validSkus);
      allResults.push(...validated);
    } catch (err) {
      const msg = `Batch ${bi + 1}/${batches.length} failed: ${(err as Error).message}`;
      errors.push(msg);
      // Add error entries for this batch so the caller knows what failed
      for (const p of batch) {
        allResults.push({
          sku: p.sku,
          season: [],
          weather: [],
          occasion: [],
          pair_with: [],
          pair_conflict: [],
          error: msg,
        });
      }
    }
  }

  // Persist to KV (unless dry run)
  let persisted = 0;
  if (!body.dryRun) {
    for (const result of allResults) {
      if (result.error) continue;
      const tag: ProductTags = {
        season: result.season,
        weather: result.weather,
        occasion: result.occasion,
        pair_with: result.pair_with,
        pair_conflict: result.pair_conflict,
        source: 'ai',
        updated_at: new Date().toISOString(),
      };
      await c.env.TAGS.put(result.sku, JSON.stringify(tag));
      persisted++;
    }
  }

  return c.json({
    status: 'ok',
    total: targets.length,
    batches: batches.length,
    persisted,
    dryRun: body.dryRun ?? false,
    errors: errors.length > 0 ? errors : undefined,
    results: allResults,
  });
}
