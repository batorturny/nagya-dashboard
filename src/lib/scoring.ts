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
// Seasonal categories
// ---------------------------------------------------------------------------

export type Season = 'tavasz' | 'nyár' | 'ősz' | 'tél';

export function currentSeason(today = new Date()): Season {
  const m = today.getMonth(); // 0-based
  if (m >= 2 && m <= 4) return 'tavasz';
  if (m >= 5 && m <= 7) return 'nyár';
  if (m >= 8 && m <= 10) return 'ősz';
  return 'tél';
}

export const SEASONAL_CATEGORIES: Record<Season, string[]> = {
  tavasz: ['Vegetables', 'Grilling food', 'Grilling non-food', 'Soft drinks', 'Bottled drinks'],
  nyár:   ['Grilling food', 'Grilling non-food', 'Soft drinks', 'Bottled drinks', 'Sweets', 'Alcoholic beverages'],
  ősz:    ['Pasta & grains', 'Bakery', 'Dairy', 'Vegetables', 'Alcoholic beverages'],
  tél:    ['Dairy', 'Pasta & grains', 'Bakery', 'Sweets', 'Alcoholic beverages'],
};

// ---------------------------------------------------------------------------
// Affinity graph — weighted category complementarity
// ---------------------------------------------------------------------------

export interface AffinityEdge {
  target: string;
  weight: number; // 0–1, higher = stronger pairing
}

export const AFFINITY: Record<string, AffinityEdge[]> = {
  'Grilling food':      [{ target: 'Grilling non-food', weight: 0.9 }, { target: 'Alcoholic beverages', weight: 0.6 }, { target: 'Soft drinks', weight: 0.5 }, { target: 'Vegetables', weight: 0.4 }],
  'Grilling non-food':  [{ target: 'Grilling food', weight: 0.9 }, { target: 'Alcoholic beverages', weight: 0.5 }],
  'Dairy':              [{ target: 'Bakery', weight: 0.7 }, { target: 'Sweets', weight: 0.5 }, { target: 'Pasta & grains', weight: 0.4 }],
  'Bakery':             [{ target: 'Dairy', weight: 0.7 }, { target: 'Sweets', weight: 0.3 }],
  'Pasta & grains':     [{ target: 'Vegetables', weight: 0.8 }, { target: 'Dairy', weight: 0.4 }],
  'Vegetables':         [{ target: 'Pasta & grains', weight: 0.8 }, { target: 'Grilling food', weight: 0.5 }, { target: 'Dairy', weight: 0.3 }],
  'Sweets':             [{ target: 'Soft drinks', weight: 0.6 }, { target: 'Dairy', weight: 0.5 }],
  'Soft drinks':        [{ target: 'Sweets', weight: 0.6 }, { target: 'Grilling food', weight: 0.5 }],
  'Alcoholic beverages':[{ target: 'Grilling food', weight: 0.6 }, { target: 'Grilling non-food', weight: 0.4 }, { target: 'Other non-food', weight: 0.3 }],
  'Bottled drinks':     [{ target: 'Vegetables', weight: 0.4 }, { target: 'Grilling food', weight: 0.3 }],
  'Other non-food':     [{ target: 'Grilling food', weight: 0.5 }, { target: 'Alcoholic beverages', weight: 0.3 }],
};

/** Backward-compat: flat list of affine categories (for UI that only needs names). */
export function affineCategoriesFor(category: string): string[] {
  return (AFFINITY[category] ?? []).map((e) => e.target);
}

/** Look up base affinity weight between two categories (0 if none). */
export function affinityWeight(catA: string, catB: string): number {
  return (AFFINITY[catA] ?? []).find((e) => e.target === catB)?.weight ?? 0;
}

// ---------------------------------------------------------------------------
// Weather multipliers for affinity (continuous, not binary)
// ---------------------------------------------------------------------------

export function weatherAffinityMultiplier(weather: WeatherSnapshot, catA: string, catB: string): number {
  const grillCats = new Set(['Grilling food', 'Grilling non-food']);
  const comfortCats = new Set(['Pasta & grains', 'Bakery', 'Dairy']);
  const coldDrinks = new Set(['Soft drinks', 'Bottled drinks']);

  const involves = (s: Set<string>) => s.has(catA) || s.has(catB);

  let mult = 1.0;

  // Hot weather → grill & cold drinks boosted
  if (weather.tempC > 28 && involves(grillCats)) mult *= 1.5;
  else if (weather.tempC > 22 && involves(grillCats)) mult *= 1.2;

  if (weather.tempC > 28 && involves(coldDrinks)) mult *= 1.3;

  // Cold weather → comfort food boosted
  if (weather.tempC < 10 && involves(comfortCats)) mult *= 1.3;
  else if (weather.tempC < 16 && involves(comfortCats)) mult *= 1.1;

  // Rain → indoor comfort
  if (weather.isRainy && involves(comfortCats)) mult *= 1.2;

  // Hot + rain dampens grill
  if (weather.isRainy && involves(grillCats)) mult *= 0.6;

  return mult;
}

// ---------------------------------------------------------------------------
// Bundle detection & creation
// ---------------------------------------------------------------------------

export interface Bundle {
  productA: Product;
  productB: Product;
  score: number;        // combined affinity score (higher = better pair)
  reason: string;       // human-readable hungarian explanation
  source: 'tag' | 'category' | 'weather';
}

export function createBundles(args: {
  /** Ranked product list (already scored for a user/campaign). */
  products: Product[];
  tags?: Record<string, ProductTags>;
  weather: WeatherSnapshot;
  maxBundles?: number;
}): Bundle[] {
  const { products, tags = {}, weather, maxBundles = 5 } = args;

  // Build SKU → Product lookup
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const candidates: Bundle[] = [];
  const seen = new Set<string>(); // "skuA|skuB" dedup key

  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  for (let i = 0; i < products.length; i++) {
    const a = products[i];
    const tA = tags[a.sku];

    // --- Layer 1: explicit tag pair_with (strongest signal) ---
    if (tA?.pair_with?.length) {
      for (const targetSku of tA.pair_with) {
        const b = bySku.get(targetSku);
        if (!b || b.sku === a.sku) continue;
        const key = pairKey(a.sku, b.sku);
        if (seen.has(key)) continue;
        seen.add(key);

        const wMult = weatherAffinityMultiplier(weather, a.category, b.category);
        candidates.push({
          productA: a,
          productB: b,
          score: 1.0 * wMult, // tag pairs start at 1.0 (max)
          reason: `${a.title} + ${b.title} — ajánlott páros`,
          source: 'tag',
        });
      }
    }

    // --- Layer 2 + 3: weighted category affinity × weather ---
    for (let j = i + 1; j < products.length; j++) {
      const b = products[j];
      const key = pairKey(a.sku, b.sku);
      if (seen.has(key)) continue;

      const baseWeight = affinityWeight(a.category, b.category);
      if (baseWeight === 0) continue;

      const wMult = weatherAffinityMultiplier(weather, a.category, b.category);
      const finalScore = baseWeight * wMult;

      seen.add(key);

      // Build reason string
      let reason = `${a.category} + ${b.category}`;
      if (wMult > 1.1) reason += ` — időjárás-kedvező (${weather.tempC.toFixed(0)}°C${weather.isRainy ? ', esős' : ''})`;
      else if (wMult < 0.8) reason += ` — időjárás miatt kevésbé ajánlott`;

      candidates.push({
        productA: a,
        productB: b,
        score: finalScore,
        reason,
        source: wMult > 1.1 ? 'weather' : 'category',
      });
    }
  }

  // Sort by score descending, pick top N ensuring each product appears at most once
  candidates.sort((a, b) => b.score - a.score);

  const used = new Set<string>();
  const result: Bundle[] = [];

  for (const c of candidates) {
    if (result.length >= maxBundles) break;
    if (used.has(c.productA.sku) || used.has(c.productB.sku)) continue;
    used.add(c.productA.sku);
    used.add(c.productB.sku);
    result.push(c);
  }

  return result;
}

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
  // Per-user boost (amplifies fav +, avoid -). Defaults to 1.0 (aggregate view).
  personalBoost?: number;
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
  // In per-user view we amplify personalization signals (fav +, avoid -) so the
  // user's favorite category outranks a slightly more urgent item from a category
  // they don't care about. Defaults to 1.0 (aggregate / admin view).
  const personalBoost = input.personalBoost ?? 1;
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
    fav: isFavorite ? Math.round(40 * personalBoost) : 0,
    avoid:
      product.category === user.least_purchased_category
        ? Math.round(-25 * personalBoost)
        : 0,
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
