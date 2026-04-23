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
// Weather → category boost heuristic (always returns at least one category
// so that weather-driven campaigns have something to promote)
// ---------------------------------------------------------------------------

export function weatherBoostCategories(w: WeatherSnapshot): string[] {
  const out = new Set<string>();
  if (w.tempC >= 18) {
    out.add('Grilling food');
    out.add('Grilling non-food');
    out.add('Soft drinks');
    out.add('Bottled drinks');
    out.add('Sweets');
  } else if (w.tempC >= 10) {
    out.add('Pasta & grains');
    out.add('Vegetables');
    out.add('Dairy');
    out.add('Bakery');
  } else {
    out.add('Dairy');
    out.add('Pasta & grains');
    out.add('Bakery');
    out.add('Alcoholic beverages');
  }
  if (w.isRainy) {
    out.add('Pasta & grains');
    out.add('Bakery');
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Seasonal heuristic — used when tags are not yet populated (Phase 2 fallback)
// ---------------------------------------------------------------------------

export type Season = 'tavasz' | 'nyár' | 'ősz' | 'tél';

export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'tavasz';
  if (m >= 6 && m <= 8) return 'nyár';
  if (m >= 9 && m <= 11) return 'ősz';
  return 'tél';
}

export const SEASONAL_CATEGORIES: Record<Season, string[]> = {
  tavasz: ['Vegetables', 'Bakery', 'Grilling food', 'Dairy'],
  nyár:   ['Grilling food', 'Grilling non-food', 'Soft drinks', 'Sweets', 'Bottled drinks'],
  ősz:    ['Pasta & grains', 'Bakery', 'Alcoholic beverages', 'Dairy'],
  tél:    ['Dairy', 'Pasta & grains', 'Bakery', 'Sweets', 'Alcoholic beverages'],
};

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

// Campaign-type weight matrix. Each signal is multiplied by the corresponding
// factor before summing. This is what makes "expiry" vs "weather" vs "seasonal"
// produce visibly different rankings instead of the same list with tiny shifts.
const CAMPAIGN_WEIGHTS: Record<CampaignType, {
  expiry: number;
  weather: number;
  seasonal: number;
  fav: number;
  avoid: number;
  velocity: number;
  tagOccasion: number;
  tagSeason: number;
}> = {
  weekly:   { expiry: 1.0, weather: 0.5, seasonal: 0.3, fav: 1.0, avoid: 1.0, velocity: 1.0, tagOccasion: 1.0, tagSeason: 1.0 },
  expiry:   { expiry: 3.0, weather: 0.0, seasonal: 0.0, fav: 0.8, avoid: 1.0, velocity: 0.3, tagOccasion: 0.0, tagSeason: 0.0 },
  weather:  { expiry: 0.3, weather: 3.0, seasonal: 0.5, fav: 0.5, avoid: 0.5, velocity: 1.0, tagOccasion: 0.5, tagSeason: 0.5 },
  seasonal: { expiry: 0.2, weather: 0.5, seasonal: 3.0, fav: 0.6, avoid: 0.6, velocity: 1.0, tagOccasion: 2.0, tagSeason: 2.5 },
  custom:   { expiry: 1.0, weather: 1.0, seasonal: 1.0, fav: 1.0, avoid: 1.0, velocity: 1.0, tagOccasion: 1.0, tagSeason: 1.0 },
};

export function scoreFor(input: ScoreInput): ScoreBreakdown {
  const { product, user, tags, weather, campaignType, today = new Date() } = input;
  const reasons: string[] = [];

  const daysLeft = daysUntil(product.expiration_date, today);
  const discount = discountFor(daysLeft);
  const w = CAMPAIGN_WEIGHTS[campaignType];

  // ------- Hard filters per campaign type (skip completely irrelevant items) -------
  if (campaignType === 'expiry' && daysLeft > 14) {
    return { total: 0, daysLeft, discount, reasons: ['skip: >14 nap lejárat'] };
  }
  const weatherBoost = weatherBoostCategories(weather);
  const isWeatherMatch = weatherBoost.includes(product.category);
  const isFavorite = product.category === user.favorite_category;

  if (campaignType === 'weather' && !isWeatherMatch && !isFavorite) {
    return { total: 0, daysLeft, discount, reasons: ['skip: nincs időjárás-match'] };
  }

  const season = currentSeason(today);
  const seasonCats = SEASONAL_CATEGORIES[season];
  const isSeasonalMatch = seasonCats.includes(product.category);
  if (campaignType === 'seasonal' && !isSeasonalMatch && !isFavorite) {
    return { total: 0, daysLeft, discount, reasons: ['skip: nincs szezon-match'] };
  }

  // ------- Signal computation -------
  let expiryBase = 0;
  if (daysLeft === 1) expiryBase = 80;
  else if (daysLeft === 2) expiryBase = 60;
  else if (daysLeft === 3) expiryBase = 40;
  else if (daysLeft >= 4 && daysLeft <= 7) expiryBase = 20;
  else if (daysLeft >= 8 && daysLeft <= 30) expiryBase = 10;

  const velocity = product.stock.current > 0
    ? product.stock.last_7_day_sold / product.stock.current
    : 0;

  const signals = {
    expiry: expiryBase,
    weather: isWeatherMatch ? 30 : 0,
    seasonal: isSeasonalMatch ? 25 : 0,
    fav: isFavorite ? 40 : 0,
    avoid: product.category === user.least_purchased_category ? -25 : 0,
    velocity: velocity >= 0.5 ? 10 : 0,
    tagOccasion: tags?.occasion?.length ? 15 : 0,
    tagSeason:
      tags?.season?.includes(season) ? 20 :
      tags?.season?.length ? 10 : 0,
  };

  const weighted = {
    expiry: Math.round(signals.expiry * w.expiry),
    weather: Math.round(signals.weather * w.weather),
    seasonal: Math.round(signals.seasonal * w.seasonal),
    fav: Math.round(signals.fav * w.fav),
    avoid: Math.round(signals.avoid * w.avoid),
    velocity: Math.round(signals.velocity * w.velocity),
    tagOccasion: Math.round(signals.tagOccasion * w.tagOccasion),
    tagSeason: Math.round(signals.tagSeason * w.tagSeason),
  };

  const total =
    weighted.expiry +
    weighted.weather +
    weighted.seasonal +
    weighted.fav +
    weighted.avoid +
    weighted.velocity +
    weighted.tagOccasion +
    weighted.tagSeason;

  if (weighted.expiry) reasons.push(`lejárat +${weighted.expiry}`);
  if (weighted.weather) reasons.push(`időjárás +${weighted.weather}`);
  if (weighted.seasonal) reasons.push(`szezon +${weighted.seasonal}`);
  if (weighted.fav) reasons.push(`kedvenc +${weighted.fav}`);
  if (weighted.avoid) reasons.push(`kerüli ${weighted.avoid}`);
  if (weighted.velocity) reasons.push(`hot +${weighted.velocity}`);
  if (weighted.tagOccasion) reasons.push(`tag·occ +${weighted.tagOccasion}`);
  if (weighted.tagSeason) reasons.push(`tag·szezon +${weighted.tagSeason}`);

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
    .filter((x) => x.breakdown.total > 0) // drop items excluded by campaign-type filter
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, limit);
}
