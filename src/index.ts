import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { weatherHandler } from './routes/weather';
import {
  createCampaignHandler,
  listCampaignsHandler,
  previewCampaignHandler,
} from './routes/campaigns';

type Bindings = {
  ASSETS: Fetcher;
  TAGS: KVNamespace;
  CAMPAIGNS: KVNamespace;

  NAGYA_API_BASE: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  OPENROUTER_MODEL: string;
  WEATHER_LAT: string;
  WEATHER_LON: string;

  // Secrets (wrangler secret put)
  RESEND_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  ACCUWEATHER_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', cors());

// ---------------------------------------------------------------------------
// Phase 1 — live data proxies
// ---------------------------------------------------------------------------

const passthroughHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60',
} as const;

app.get('/api/users', async (c) => {
  const res = await fetch(`${c.env.NAGYA_API_BASE}/users`, {
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) return c.json({ error: 'upstream_error', status: res.status }, 502);
  return new Response(await res.text(), { headers: passthroughHeaders });
});

app.get('/api/products', async (c) => {
  const upstream = new URL(c.env.NAGYA_API_BASE + '/products');
  for (const [k, v] of new URL(c.req.url).searchParams) upstream.searchParams.set(k, v);

  const res = await fetch(upstream.toString(), {
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) return c.json({ error: 'upstream_error', status: res.status }, 502);
  return new Response(await res.text(), { headers: passthroughHeaders });
});

// ---------------------------------------------------------------------------
// Phase 2 — product tag store (AI-assisted)
// ---------------------------------------------------------------------------

app.get('/api/tags', async (c) => {
  const list = await c.env.TAGS.list();
  const tags: Record<string, unknown> = {};
  for (const key of list.keys) {
    const v = await c.env.TAGS.get(key.name, 'json');
    if (v) tags[key.name] = v;
  }
  return c.json({ count: Object.keys(tags).length, tags });
});

app.put('/api/tags/:sku', async (c) => {
  const sku = c.req.param('sku');
  const body = await c.req.json();
  const record = { ...body, source: 'manual', updated_at: new Date().toISOString() };
  await c.env.TAGS.put(sku, JSON.stringify(record));
  return c.json({ sku, tags: record });
});

app.post('/api/ai-tag', (c) =>
  c.json(
    { status: 'not_implemented', phase: 2, hint: 'Gemini Flash batch tagging — coming in Phase 2' },
    501,
  ),
);

// ---------------------------------------------------------------------------
// Phase 3 — weather + campaign composer
// ---------------------------------------------------------------------------

app.get('/api/weather', weatherHandler);
app.get('/api/campaigns', listCampaignsHandler);
app.post('/api/campaigns', createCampaignHandler);
app.post('/api/campaigns/preview', previewCampaignHandler);

// ---------------------------------------------------------------------------
// Phase 4 — send via Resend
// ---------------------------------------------------------------------------

app.post('/api/send', (c) =>
  c.json({ status: 'not_implemented', phase: 4, hint: 'Resend integration — Phase 4' }, 501),
);

// ---------------------------------------------------------------------------
// Fallback: static assets (React SPA)
// ---------------------------------------------------------------------------

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
