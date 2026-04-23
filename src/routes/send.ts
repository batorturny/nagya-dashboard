import type { Context } from 'hono';

import {
  rankProductsForCampaign,
  type CampaignType,
  type Product,
  type ProductTags,
  type User,
  type WeatherSnapshot,
} from '../lib/scoring';
import {
  priceItem,
  renderEmailHtml,
  type PricedItem,
} from '../lib/coupon';

interface Bindings {
  CAMPAIGNS: KVNamespace;
  TAGS: KVNamespace;
  NAGYA_API_BASE: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  RESEND_API_KEY?: string;
  TEST_INBOX?: string;           // override recipient (unverified-domain demos)
}

interface SendBody {
  type: CampaignType;
  productSkus: string[];
  userIds?: number[];
  weather?: WeatherSnapshot;
  perUserLimit?: number;
  dryRun?: boolean;              // if true, renders emails but does not call Resend
  subjectTemplate?: string;      // default: "{first_name}, a heti kedvenceid {category}"
}

interface PersonalisedCampaign {
  id: string;
  createdAt: string;
  type: CampaignType;
  productSkus: string[];
  subjectTemplate: string;
  validUntil: string;
  perUser: Array<{
    userId: number;
    name: string;
    email: string;
    items: PricedItem[];
  }>;
}

interface SendResult {
  userId: number;
  email: string;
  status: 'sent' | 'failed' | 'skipped';
  resendId?: string;
  error?: string;
  couponUrl: string;
  itemCount: number;
}

const CAMPAIGN_LABELS: Record<CampaignType, string> = {
  weekly: 'Heti ajánlat',
  expiry: 'Lejárati akció',
  weather: 'Időjárás-tipp',
  seasonal: 'Szezon-nyitó',
  custom: 'Egyedi ajánlat',
};

export async function sendCampaignHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const body = (await c.req.json()) as SendBody;

  if (!body.productSkus?.length) {
    return c.json({ error: 'productSkus required' }, 400);
  }

  const origin = new URL(c.req.url).origin;

  // Fetch products + users + weather in parallel
  const [productsRes, usersRes] = await Promise.all([
    fetch(`${c.env.NAGYA_API_BASE}/products`),
    fetch(`${c.env.NAGYA_API_BASE}/users`),
  ]);
  if (!productsRes.ok || !usersRes.ok) {
    return c.json({ error: 'upstream_error' }, 502);
  }

  const productEnvelope = (await productsRes.json()) as { data: Product[] };
  const userEnvelope = (await usersRes.json()) as { data: User[] };

  const selected = productEnvelope.data.filter((p) =>
    body.productSkus.includes(p.sku),
  );

  // Tags for scoring
  const tagEntries = await Promise.all(
    selected.map(async (p) => {
      const v = await c.env.TAGS.get(p.sku, 'json');
      return [p.sku, (v ?? {}) as ProductTags] as const;
    }),
  );
  const tagsBySku: Record<string, ProductTags> = Object.fromEntries(tagEntries);

  const weather: WeatherSnapshot = body.weather ?? { tempC: 15, isRainy: false };
  const eligibleUsers = body.userIds
    ? userEnvelope.data.filter((u) => body.userIds!.includes(u.id))
    : userEnvelope.data;

  const campaignId = crypto.randomUUID();
  const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  // Build per-user personalised item lists.
  // For each user we expand the admin-picked selection with up to 3 products
  // from their favorite_category (if not already included), so that e.g. a
  // "Bakery" user always sees bakery items even when the composer selection
  // didn't happen to include any.
  const perUser = eligibleUsers.map((user) => {
    const favCatBoost = productEnvelope.data
      .filter((p) => p.category === user.favorite_category)
      .filter((p) => !selected.find((s) => s.sku === p.sku))
      .slice(0, 3);
    const forUser = [...selected, ...favCatBoost];

    // Pull tags for the extra favorite-category items as well
    const ranked = rankProductsForCampaign({
      products: forUser,
      user,
      tags: tagsBySku,
      weather,
      campaignType: body.type,
      limit: body.perUserLimit ?? Math.min(forUser.length, 5),
    });
    const items = ranked.map((r) => priceItem(r.product, user.id));
    return { userId: user.id, name: user.name, email: user.email, items };
  });

  // Tags for any newly pulled favorite-category products (so the preview+personalise
  // logic still has them when rehydrated later).
  const allExtraSkus = new Set<string>();
  for (const row of perUser) for (const it of row.items) allExtraSkus.add(it.sku);
  await Promise.all(
    [...allExtraSkus]
      .filter((sku) => !tagsBySku[sku])
      .map(async (sku) => {
        const v = await c.env.TAGS.get(sku, 'json');
        if (v) tagsBySku[sku] = v as ProductTags;
      }),
  );

  // Persist campaign (needed by the coupon page to rehydrate per-user items)
  const campaign: PersonalisedCampaign = {
    id: campaignId,
    createdAt: new Date().toISOString(),
    type: body.type,
    productSkus: body.productSkus,
    subjectTemplate:
      body.subjectTemplate ??
      '{firstName}, személyre szabott kuponok a kedvenc kategóriádból',
    validUntil,
    perUser,
  };
  await c.env.CAMPAIGNS.put(campaignId, JSON.stringify(campaign));

  // Send (or dry-run) per user
  const apiKey = c.env.RESEND_API_KEY;
  const results: SendResult[] = [];

  for (const row of perUser) {
    const couponUrl = `${origin}/coupon-booklet?c=${campaignId}&u=${row.userId}&download=auto`;
    if (row.items.length === 0) {
      results.push({
        userId: row.userId,
        email: row.email,
        status: 'skipped',
        error: 'no personalised items',
        couponUrl,
        itemCount: 0,
      });
      continue;
    }

    const user = eligibleUsers.find((u) => u.id === row.userId)!;
    const html = renderEmailHtml({
      origin,
      userName: row.name,
      userGreetingCategory: user.favorite_category,
      items: row.items,
      couponUrl,
      campaignLabel: CAMPAIGN_LABELS[body.type] ?? CAMPAIGN_LABELS.custom,
      validUntil: formatHungarianDate(validUntil),
      senderName: c.env.SENDER_NAME,
    });

    const firstName = row.name.split(' ').slice(-1)[0] ?? row.name;
    const subject = campaign.subjectTemplate
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{category\}/g, user.favorite_category);

    if (body.dryRun || !apiKey) {
      results.push({
        userId: row.userId,
        email: row.email,
        status: body.dryRun ? 'skipped' : 'failed',
        error: body.dryRun ? 'dry-run' : 'RESEND_API_KEY not configured',
        couponUrl,
        itemCount: row.items.length,
      });
      continue;
    }

    // In test mode (unverified sender domain) Resend only accepts the account
    // owner as recipient. Preserve the original email in the subject so the
    // demo still shows "email #N for user X".
    const testInbox = c.env.TEST_INBOX?.trim();
    const recipient = testInbox || row.email;
    const subjectWithMarker = testInbox
      ? `[${row.email}] ${subject}`
      : subject;

    // Inline product images as attachments so they render even when Gmail
    // blocks external images by default.
    const attachments = await buildImageAttachments(origin, row.items);

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${c.env.SENDER_NAME} <${c.env.SENDER_EMAIL}>`,
          to: [recipient],
          subject: subjectWithMarker,
          html,
          attachments,
        }),
      });
      const data = (await res.json()) as { id?: string; message?: string; name?: string };
      if (!res.ok) {
        results.push({
          userId: row.userId,
          email: row.email,
          status: 'failed',
          error: data.message || data.name || `HTTP ${res.status}`,
          couponUrl,
          itemCount: row.items.length,
        });
      } else {
        results.push({
          userId: row.userId,
          email: row.email,
          status: 'sent',
          resendId: data.id,
          couponUrl,
          itemCount: row.items.length,
        });
      }
    } catch (err) {
      results.push({
        userId: row.userId,
        email: row.email,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        couponUrl,
        itemCount: row.items.length,
      });
    }
  }

  return c.json({
    status: 'ok',
    campaignId,
    dryRun: Boolean(body.dryRun),
    resendConfigured: Boolean(apiKey),
    results,
  });
}

export async function getCouponHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const campaignId = c.req.param('campaignId');
  const userId = Number(c.req.param('userId'));
  if (!campaignId || !Number.isFinite(userId)) {
    return c.json({ error: 'invalid params' }, 400);
  }
  const campaign = (await c.env.CAMPAIGNS.get(campaignId, 'json')) as PersonalisedCampaign | null;
  if (!campaign) {
    return c.json({ error: 'campaign not found' }, 404);
  }
  const row = campaign.perUser.find((r) => r.userId === userId);
  if (!row) {
    return c.json({ error: 'user not in campaign' }, 404);
  }
  return c.json({
    campaignId,
    type: campaign.type,
    label: CAMPAIGN_LABELS[campaign.type] ?? CAMPAIGN_LABELS.custom,
    validUntil: campaign.validUntil,
    user: { id: row.userId, name: row.name, email: row.email },
    items: row.items,
  });
}

export async function getEmailPreviewHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const campaignId = c.req.param('campaignId');
  const userId = Number(c.req.param('userId'));
  if (!campaignId) return c.text('campaignId missing', 400);
  const campaign = (await c.env.CAMPAIGNS.get(campaignId, 'json')) as PersonalisedCampaign | null;
  if (!campaign) return c.text('campaign not found', 404);
  const row = campaign.perUser.find((r) => r.userId === userId);
  if (!row) return c.text('user not in campaign', 404);
  const origin = new URL(c.req.url).origin;
  const html = renderEmailHtml({
    origin,
    userName: row.name,
    userGreetingCategory: 'N/A',
    items: row.items,
    couponUrl: `${origin}/coupon-booklet?c=${campaignId}&u=${userId}`,
    campaignLabel: CAMPAIGN_LABELS[campaign.type] ?? CAMPAIGN_LABELS.custom,
    validUntil: formatHungarianDate(campaign.validUntil),
    senderName: c.env.SENDER_NAME,
  });
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function formatHungarianDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}.${m}.${d}`;
}

interface ResendAttachment {
  filename: string;
  content: string;      // base64
  contentId: string;    // inline — referenced via cid:<id>
  contentType: string;
}

// Fetch each product image from the Worker's own asset bucket and return them
// as base64 inline attachments. Keeps the email self-contained so Gmail's
// "external images are blocked" banner does not break the layout.
async function buildImageAttachments(
  origin: string,
  items: PricedItem[],
): Promise<ResendAttachment[]> {
  const uniqueSkus = [...new Set(items.map((i) => i.sku))];
  const results = await Promise.all(
    uniqueSkus.map(async (sku) => {
      try {
        const res = await fetch(`${origin}/images/${sku}.webp`);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return {
          filename: `${sku}.webp`,
          content: arrayBufferToBase64(buf),
          contentId: `img-${sku}`,
          contentType: 'image/webp',
        } satisfies ResendAttachment;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is ResendAttachment => r !== null);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
