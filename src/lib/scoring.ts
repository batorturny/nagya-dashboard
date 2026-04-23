// Shared scoring + discount logic. Imported by the Worker (/api/campaigns/preview)
// AND by the React composer UI (Phase 3 live feedback).
// Pure functions only — no I/O.

// ---------------------------------------------------------------------------
// Types (subset of the live API + Phase 2 tag contract)
// ---------------------------------------------------------------------------

export interface Product {
  id: number;
  sku: string;
  title: string;
  category: string;
  description: string;
  allergens: string[];
  expiration_date: string;
  price: { value: number; cost_price: number; bottle_deposit: number };
  stock: { current: number; last_7_day_sold: number };
}

export interface User {
  id: number;
  name: string;
  email: string;
  favorite_category: string;
  least_purchased_category: string;
}

export interface ProductTags {
  season?: string[];
  weather?: string[];
  occasion?: string[];
  pair_with?: string[];
  pair_conflict?: string[];
  source?: 'ai' | 'manual';
  updated_at?: string;
}

export type CampaignType = 'weekly' | 'expiry' | 'weather' | 'seasonal' | 'custom';

export interface WeatherSnapshot {
  tempC: number;
  isRainy: boolean;
}

// ---------------------------------------------------------------------------
// Discount ladder
// ---------------------------------------------------------------------------

export type DiscountTone = 'urgent' | 'warn' | 'coupon' | 'none';

export interface Discount {
  pct: number;
  tone: DiscountTone;
  label: string;
}

export function daysUntil(isoDate: string, today = new Date()): number {
  const d = new Date(isoDate + 'T00:00:00Z').getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d - t) / 86_400_000);
}

export function discountFor(daysLeft: number): Discount {
  if (daysLeft === 1) return { pct: 50, tone: 'urgent', label: 'Ma lejár · -50%' };
  if (daysLeft === 2) return { pct: 20, tone: 'urgent', label: 'Holnap lejár · -20%' };
  if (daysLeft === 3) return { pct: 0, tone: 'warn', label: 'Hamarosan lejár' };
  if (daysLeft >= 4 && daysLeft <= 7) return { pct: 15, tone: 'coupon', label: 'Kuponnal -15%' };
  if (daysLeft >= 8 && daysLeft <= 30) return { pct: 10, tone: 'coupon', label: 'Kuponnal -10%' };
  return { pct: 0, tone: 'none', label: '' };
}

// ---------------------------------------------------------------------------
// Weather → category boost heuristic
// ---------------------------------------------------------------------------

export function weatherBoostCategories(w: WeatherSnapshot): string[] {
  const out: string[] = [];
  if (w.tempC > 22) out.push('Grilling food', 'Grilling non-food', 'Soft drinks', 'Bottled drinks', 'Sweets');
  if (w.tempC < 10) out.push('Dairy', 'Pasta & grains', 'Bakery');
  if (w.isRainy) out.push('Pasta & grains', 'Bakery');
  return out;
}

// ---------------------------------------------------------------------------
// Affinity graph (categories that complement each other)
// ---------------------------------------------------------------------------

export const AFFINITY: Record<string, string[]> = {
  'Grilling food': ['Grilling non-food', 'Alcoholic beverages', 'Soft drinks'],
  'Grilling non-food': ['Grilling food', 'Alcoholic beverages'],
  'Dairy': ['Bakery', 'Sweets'],
  'Bakery': ['Dairy'],
  'Pasta & grains': ['Vegetables', 'Dairy'],
  'Vegetables': ['Pasta & grains', 'Grilling food'],
  'Sweets': ['Soft drinks', 'Dairy'],
  'Soft drinks': ['Sweets', 'Grilling food'],
  'Alcoholic beverages': ['Grilling food', 'Other non-food'],
  'Bottled drinks': ['Vegetables'],
  'Other non-food': ['Grilling food', 'Alcoholic beverages'],
};

// ---------------------------------------------------------------------------
// Campaign metadata
// ---------------------------------------------------------------------------

export const CAMPAIGN_META: Record<CampaignType, { label: string; blurb: string; emoji: string }> = {
  weekly: { label: 'Heti', blurb: 'Vegyes ajánlat a hét minden napjára', emoji: '📅' },
  expiry: { label: 'Lejáratakció', blurb: '≤3 napos termékekre eszkalált kedvezmény', emoji: '⏰' },
  weather: { label: 'Időjárás-tipp', blurb: 'A jelenlegi időjáráshoz illő termékek', emoji: '🌤️' },
  seasonal: { label: 'Szezon-nyitó', blurb: 'Az évszakra hangolt válogatás', emoji: '🌿' },
  custom: { label: 'Egyedi', blurb: 'Kézzel válogatott', emoji: '✏️' },
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreInput {
  product: Product;
  user: User;
  tags?: ProductTags;
  weather: WeatherSnapshot;
  campaignType: CampaignType;
  today?: Date;
}

export interface ScoreBreakdown {
  total: number;
  daysLeft: number;
  discount: Discount;
  reasons: string[];
}

export function scoreFor(input: ScoreInput): ScoreBreakdown {
  const { product, user, tags, weather, campaignType, today = new Date() } = input;
  const reasons: string[] = [];
  let total = 0;

  const daysLeft = daysUntil(product.expiration_date, today);
  const discount = discountFor(daysLeft);

  // Expiry urgency
  if (daysLeft === 1) {
    total += 80;
    reasons.push('+80 ma lejár');
  } else if (daysLeft === 2) {
    total += 60;
    reasons.push('+60 holnap lejár');
  } else if (daysLeft === 3) {
    total += 40;
    reasons.push('+40 hamarosan lejár');
  } else if (daysLeft >= 4 && daysLeft <= 7) {
    total += 20;
    reasons.push('+20 heti lejárat');
  } else if (daysLeft >= 8 && daysLeft <= 30) {
    total += 10;
    reasons.push('+10 havon belüli lejárat');
  }

  // Personalization
  if (product.category === user.favorite_category) {
    total += 40;
    reasons.push(`+40 kedvenc: ${product.category}`);
  }
  if (product.category === user.least_purchased_category) {
    total -= 25;
    reasons.push(`-25 kerüli: ${product.category}`);
  }

  // Hot mover
  const velocity = product.stock.current > 0
    ? product.stock.last_7_day_sold / product.stock.current
    : 0;
  if (velocity >= 0.5) {
    total += 10;
    reasons.push('+10 hot mover');
  }

  // Weather
  const wBoost = weatherBoostCategories(weather);
  if (wBoost.includes(product.category)) {
    total += 15;
    reasons.push('+15 időjárás-match');
  }

  // Category affinity — soft hint, counted regardless of other selections in list.
  // (UI adds explicit bundle boosts on top when another picked product is in AFFINITY[category].)
  const campaignPrefers: Partial<Record<CampaignType, string[]>> = {
    weather: wBoost,
    seasonal: wBoost,
    expiry: [],
    weekly: [],
    custom: [],
  };
  const campaignBoost = campaignPrefers[campaignType] ?? [];
  if (campaignBoost.includes(product.category)) {
    total += 5;
    reasons.push(`+5 ${campaignType} campaign`);
  }

  // Optional tag signals (Phase 2 — graceful fallback if tags empty)
  if (tags?.occasion?.includes('grill') && campaignType === 'seasonal' && weather.tempC > 22) {
    total += 10;
    reasons.push('+10 grill occasion tag');
  }

  return { total, daysLeft, discount, reasons };
}

// ---------------------------------------------------------------------------
// Pair conflict detection (substitute pairs in the current cart)
// ---------------------------------------------------------------------------

export interface ConflictPair {
  a: string; // SKU
  b: string; // SKU
  reason: 'same_category' | 'explicit_tag';
}

export function detectConflicts(
  selected: Product[],
  tags: Record<string, ProductTags> = {},
): ConflictPair[] {
  const out: ConflictPair[] = [];

  // Explicit tag-based conflicts
  for (const p of selected) {
    const t = tags[p.sku];
    if (!t?.pair_conflict?.length) continue;
    for (const other of t.pair_conflict) {
      if (selected.some((s) => s.sku === other)) {
        out.push({ a: p.sku, b: other, reason: 'explicit_tag' });
      }
    }
  }

  // Category heuristic — two selected products from the same category, similar price
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i];
      const b = selected[j];
      if (a.category !== b.category) continue;
      const pa = a.price.value;
      const pb = b.price.value;
      const ratio = Math.max(pa, pb) / Math.max(1, Math.min(pa, pb));
      if (ratio <= 1.8) {
        // Skip if already flagged explicitly
        const already = out.some(
          (c) => (c.a === a.sku && c.b === b.sku) || (c.a === b.sku && c.b === a.sku),
        );
        if (!already) out.push({ a: a.sku, b: b.sku, reason: 'same_category' });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Campaign suggestion (top N by score for a given user OR average)
// ---------------------------------------------------------------------------

export function rankProductsForCampaign(args: {
  products: Product[];
  user?: User; // if omitted, scores against an aggregate "any user" view
  tags?: Record<string, ProductTags>;
  weather: WeatherSnapshot;
  campaignType: CampaignType;
  limit?: number;
  today?: Date;
}): Array<{ product: Product; breakdown: ScoreBreakdown }> {
  const { products, user, tags = {}, weather, campaignType, limit = 10, today } = args;

  const fakeUser: User = user ?? {
    id: -1,
    name: '(aggregate)',
    email: '',
    favorite_category: '',
    least_purchased_category: '',
  };

  return products
    .map((p) => ({
      product: p,
      breakdown: scoreFor({
        product: p,
        user: fakeUser,
        tags: tags[p.sku],
        weather,
        campaignType,
        today,
      }),
    }))
    .filter((x) => daysUntil(x.product.expiration_date, today) >= 1) // drop expired
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, limit);
}
