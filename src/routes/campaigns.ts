import type { Context } from 'hono';

import {
  rankProductsForCampaign,
  type CampaignType,
  type Product,
  type ProductTags,
  type User,
  type WeatherSnapshot,
} from '../lib/scoring';

interface Bindings {
  CAMPAIGNS: KVNamespace;
  TAGS: KVNamespace;
  NAGYA_API_BASE: string;
  WEATHER_LAT: string;
  WEATHER_LON: string;
}

export async function listCampaignsHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const list = await c.env.CAMPAIGNS.list();
  const items = await Promise.all(
    list.keys.map(async (k) => {
      const v = await c.env.CAMPAIGNS.get(k.name, 'json');
      return { id: k.name, ...(v as object | null) };
    }),
  );
  return c.json({ count: items.length, campaigns: items });
}

export async function createCampaignHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const record = { ...body, id, created_at: new Date().toISOString() };
  await c.env.CAMPAIGNS.put(id, JSON.stringify(record));
  return c.json(record, 201);
}

interface PreviewBody {
  type: CampaignType;
  productSkus: string[];
  userIds?: number[];
  weather?: WeatherSnapshot;
  perUserLimit?: number;
}

export async function previewCampaignHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const body = (await c.req.json()) as PreviewBody;

  if (!body.productSkus?.length) {
    return c.json({ error: 'productSkus required' }, 400);
  }

  // Fetch products and users in parallel from the live API.
  const [productsRes, usersRes, weather] = await Promise.all([
    fetch(`${c.env.NAGYA_API_BASE}/products`),
    fetch(`${c.env.NAGYA_API_BASE}/users`),
    body.weather
      ? Promise.resolve(body.weather)
      : fetchWeatherForScoring(c.env),
  ]);

  if (!productsRes.ok || !usersRes.ok) {
    return c.json({ error: 'upstream_error' }, 502);
  }

  const productEnvelope = (await productsRes.json()) as { data: Product[] };
  const userEnvelope = (await usersRes.json()) as { data: User[] };

  const selectedProducts = productEnvelope.data.filter((p) =>
    body.productSkus.includes(p.sku),
  );

  // Pull tags for the selected SKUs (Phase 2 contract; empty object if none stored).
  const tagEntries = await Promise.all(
    selectedProducts.map(async (p) => {
      const v = await c.env.TAGS.get(p.sku, 'json');
      return [p.sku, (v ?? {}) as ProductTags] as const;
    }),
  );
  const tagsBySku: Record<string, ProductTags> = Object.fromEntries(tagEntries);

  const eligibleUsers = body.userIds
    ? userEnvelope.data.filter((u) => body.userIds!.includes(u.id))
    : userEnvelope.data;

  const perUser = eligibleUsers.map((user) => {
    const ranked = rankProductsForCampaign({
      products: selectedProducts,
      user,
      tags: tagsBySku,
      weather,
      campaignType: body.type,
      limit: body.perUserLimit ?? Math.min(selectedProducts.length, 5),
    });

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      products: ranked.map((r) => ({
        sku: r.product.sku,
        title: r.product.title,
        category: r.product.category,
        price: r.product.price.value,
        score: r.breakdown.total,
        daysLeft: r.breakdown.daysLeft,
        discount: r.breakdown.discount,
        reasons: r.breakdown.reasons,
      })),
    };
  });

  return c.json({
    status: 'ok',
    campaignType: body.type,
    weather,
    perUser,
  });
}

async function fetchWeatherForScoring(env: Bindings): Promise<WeatherSnapshot> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', env.WEATHER_LAT);
    url.searchParams.set('longitude', env.WEATHER_LON);
    url.searchParams.set('current', 'temperature_2m,precipitation,weather_code');
    url.searchParams.set('timezone', 'Europe/Budapest');
    const res = await fetch(url.toString(), {
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`weather status ${res.status}`);
    const json = (await res.json()) as {
      current: { temperature_2m: number; precipitation: number };
    };
    return {
      tempC: json.current.temperature_2m,
      isRainy: json.current.precipitation > 0.2,
    };
  } catch {
    // Safe default if Open-Meteo is unavailable
    return { tempC: 15, isRainy: false };
  }
}
