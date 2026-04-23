import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Plus,
  Save,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CAMPAIGN_META,
  type CampaignType,
  type Product,
  type ProductTags,
  type User,
  type WeatherSnapshot,
  createBundles,
  detectConflicts,
  rankProductsForCampaign,
  scoreFor,
} from '../../src/lib/scoring';

type ApiEnvelope<T> = { data: T[]; count: number; categories?: string[] };

interface WeatherApiResponse {
  location: string;
  current: { tempC: number; label: string; emoji: string; isRainy: boolean };
  daily: Array<{ date: string; tempMax: number; label: string; emoji: string; isRainy: boolean }>;
}

interface TagsApiResponse {
  count: number;
  tags: Record<string, ProductTags>;
}

const HUF = new Intl.NumberFormat('hu-HU');
const CAMPAIGN_TYPES: CampaignType[] = ['weekly', 'expiry', 'weather', 'seasonal'];

export function Compose() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [tags, setTags] = useState<Record<string, ProductTags>>({});
  const [weather, setWeather] = useState<WeatherApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [campaignType, setCampaignType] = useState<CampaignType>('expiry');
  const [productCount, setProductCount] = useState<number>(5);
  const [removedSkus, setRemovedSkus] = useState<Set<string>>(new Set());
  const [savedId, setSavedId] = useState<string | null>(null);

  type SendStatus = { userId: number; name: string; email: string; status: 'sent' | 'failed'; error?: string };
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendStatus[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Initial load: products + users + tags + weather in parallel
  // -------------------------------------------------------------------------
  useEffect(() => {
    Promise.all([
      fetch('/api/products').then((r) => r.json()) as Promise<ApiEnvelope<Product>>,
      fetch('/api/users').then((r) => r.json()) as Promise<ApiEnvelope<User>>,
      fetch('/api/tags').then((r) => r.json()).catch(() => ({ count: 0, tags: {} })) as Promise<TagsApiResponse>,
      fetch('/api/weather').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<WeatherApiResponse | null>,
    ])
      .then(([p, u, t, w]) => {
        setProducts(p.data);
        setUsers(u.data);
        setTags(t.tags ?? {});
        setWeather(w);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // Reset selection when campaign type changes
  useEffect(() => {
    setRemovedSkus(new Set());
    setSavedId(null);
  }, [campaignType]);

  const weatherSnap: WeatherSnapshot = useMemo(
    () => ({
      tempC: weather?.current.tempC ?? 15,
      isRainy: weather?.current.isRainy ?? false,
    }),
    [weather],
  );

  // -------------------------------------------------------------------------
  // Suggested products (aggregate score, top N, minus removed)
  // -------------------------------------------------------------------------
  const suggested = useMemo(() => {
    if (!products) return [];
    const ranked = rankProductsForCampaign({
      products,
      tags,
      weather: weatherSnap,
      campaignType,
      limit: Math.max(productCount + removedSkus.size + 5, productCount * 2),
    });
    return ranked
      .filter((r) => !removedSkus.has(r.product.sku))
      .slice(0, productCount);
  }, [products, tags, weatherSnap, campaignType, productCount, removedSkus]);

  const selectedProducts = useMemo(
    () => suggested.map((s) => s.product),
    [suggested],
  );

  const conflicts = useMemo(
    () => detectConflicts(selectedProducts, tags),
    [selectedProducts, tags],
  );

  const bundles = useMemo(
    () =>
      createBundles({
        products: selectedProducts,
        tags,
        weather: weatherSnap,
        maxBundles: Math.min(3, Math.floor(selectedProducts.length / 2)),
      }),
    [selectedProducts, tags, weatherSnap],
  );

  // -------------------------------------------------------------------------
  // Per-user personalization preview
  // -------------------------------------------------------------------------
  const perUser = useMemo(() => {
    if (!users) return [];
    return users.map((user) => {
      const ranked = selectedProducts
        .map((product) => ({
          product,
          breakdown: scoreFor({
            product,
            user,
            tags: tags[product.sku],
            weather: weatherSnap,
            campaignType,
          }),
        }))
        .filter((x) => x.breakdown.total > 0)
        .sort((a, b) => b.breakdown.total - a.breakdown.total)
        .slice(0, Math.min(3, selectedProducts.length));
      return { user, items: ranked };
    });
  }, [users, selectedProducts, tags, weatherSnap, campaignType]);

  // -------------------------------------------------------------------------
  // Send handler
  // -------------------------------------------------------------------------
  async function handleSend() {
    if (!users || selectedProducts.length === 0) return;
    setSending(true);
    setSendResults(null);
    try {
      const body = {
        products: selectedProducts,
        users,
        perUser: perUser.map((pu) => ({
          userId: pu.user.id,
          skus: pu.items.map((i) => i.product.sku),
        })),
      };
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { sent: number; total: number; results: SendStatus[] };
      setSendResults(data.results);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------
  async function handleSave() {
    setSavedId(null);
    try {
      const body = {
        type: campaignType,
        productSkus: selectedProducts.map((p) => p.sku),
        created_for: perUser.map((pu) => ({
          userId: pu.user.id,
          skus: pu.items.map((i) => i.product.sku),
        })),
      };
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      const saved = (await res.json()) as { id: string };
      setSavedId(saved.id);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Betöltési hiba</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!products || !users) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 flex items-center gap-2 text-muted-foreground">
        <CircleDashed className="animate-spin" /> Betöltés…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Heading */}
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Composer</h1>
          <p className="text-muted-foreground text-sm">
            Kampány-típus → súlyozott javaslatok → per-user preview
          </p>
        </div>
        {weather && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{weather.current.emoji}</span>
            <span className="tabular-nums">{Math.round(weather.current.tempC)}°C</span>
            <span className="text-muted-foreground">· {weather.current.label}</span>
          </div>
        )}
      </header>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kampány beállítások</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Típus
            </label>
            <Tabs value={campaignType} onValueChange={(v) => setCampaignType(v as CampaignType)}>
              <TabsList className="bg-muted">
                {CAMPAIGN_TYPES.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    <span className="mr-1.5">{CAMPAIGN_META[t].emoji}</span>
                    {CAMPAIGN_META[t].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground pt-1">
              {CAMPAIGN_META[campaignType].blurb}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Termékszám
              </label>
              <span className="text-sm font-semibold tabular-nums">{productCount} / 10</span>
            </div>
            <Slider
              value={[productCount]}
              onValueChange={([v]) => setProductCount(v ?? 5)}
              min={1}
              max={10}
              step={1}
            />
          </div>
        </CardContent>
      </Card>

      {/* Suggested products */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Javasolt termékek</h2>
          <span className="text-xs text-muted-foreground">
            {selectedProducts.length} aktív · {removedSkus.size} visszavonva
          </span>
        </div>

        {selectedProducts.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nincs eredmény erre a típusra. Próbálj másik típust vagy növeld a termékszámot.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggested.map(({ product: p, breakdown }) => {
              const involvedInConflict = conflicts.some(
                (c) => c.a === p.sku || c.b === p.sku,
              );
              return (
                <Card key={p.sku} className={involvedInConflict ? 'border-destructive/60' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <img
                        src={`/images/${p.sku}.webp`}
                        alt={p.title}
                        loading="lazy"
                        className="h-16 w-16 rounded-md object-cover border border-border shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{p.title}</div>
                            <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() =>
                              setRemovedSkus((s) => new Set(s).add(p.sku))
                            }
                            aria-label="Eltávolítás"
                          >
                            <X />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="outline">{p.category}</Badge>
                          <Badge variant="secondary" className="tabular-nums">
                            score {breakdown.total}
                          </Badge>
                          {breakdown.discount.tone === 'urgent' && (
                            <Badge
                              variant="destructive"
                              className="bg-destructive/15 text-destructive hover:bg-destructive/25"
                            >
                              {breakdown.discount.label}
                            </Badge>
                          )}
                          {breakdown.discount.tone === 'warn' && (
                            <Badge variant="warning">{breakdown.discount.label}</Badge>
                          )}
                          {breakdown.discount.tone === 'coupon' && (
                            <Badge variant="success">{breakdown.discount.label}</Badge>
                          )}
                          <span className="text-muted-foreground tabular-nums">
                            {HUF.format(p.price.value)} Ft
                          </span>
                          <span className="text-muted-foreground">
                            · {breakdown.daysLeft} nap
                          </span>
                        </div>
                        {involvedInConflict && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" />
                            substitute konfliktus másik elemmel
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {removedSkus.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRemovedSkus(new Set())}
            className="text-xs"
          >
            <Plus /> Visszavont elemek visszaállítása
          </Button>
        )}

        {conflicts.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" />
                {conflicts.length} helyettesítő ütközés
              </div>
              {conflicts.map((c, i) => (
                <div key={i} className="text-muted-foreground font-mono">
                  {c.a} ↔ {c.b} <span className="opacity-60">({c.reason})</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Bundles */}
      {bundles.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Bundle ajánlatok</h2>
          <p className="text-xs text-muted-foreground">
            Egymást kiegészítő terméktpárok — kategória affinitás + időjárás alapján rangsorolva.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bundles.map((bundle, i) => (
              <Card key={i} className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-primary border-primary/40">
                      {bundle.source === 'tag' ? 'Ajánlott pár' : bundle.source === 'weather' ? 'Időjárás' : 'Kategória'}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      score {bundle.score.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <img
                          src={`/images/${bundle.productA.sku}.webp`}
                          alt={bundle.productA.title}
                          loading="lazy"
                          className="h-10 w-10 rounded object-cover border border-border shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{bundle.productA.title}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{bundle.productA.sku}</div>
                        </div>
                      </div>
                    </div>
                    <span className="text-muted-foreground text-lg shrink-0">+</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <img
                          src={`/images/${bundle.productB.sku}.webp`}
                          alt={bundle.productB.title}
                          loading="lazy"
                          className="h-10 w-10 rounded object-cover border border-border shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{bundle.productB.title}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{bundle.productB.sku}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{bundle.reason}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Per-user preview */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Per-user preview</h2>
        <p className="text-xs text-muted-foreground">
          Ugyanaz a termékkészlet, de minden usernél más a top-3 a preferenciái + scoring alapján.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {perUser.map(({ user, items }) => (
            <Card key={user.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {user.name}
                </CardTitle>
                <CardDescription className="text-xs">
                  kedvenc: {user.favorite_category}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {items.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">
                    Nincs releváns termék — másik típust vagy több terméket próbálj.
                  </div>
                ) : (
                  items.map(({ product, breakdown }) => (
                    <div
                      key={product.sku}
                      className="flex items-center gap-2 text-xs rounded-md bg-muted/40 px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{product.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {product.sku} · {product.category}
                        </div>
                      </div>
                      <Badge variant="secondary" className="tabular-nums">
                        {breakdown.total}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={selectedProducts.length === 0}>
            <Save /> Mentés kampányként
          </Button>

          {!confirmOpen ? (
            <Button
              variant="default"
              className="bg-[#E2450C] hover:bg-[#c93a09] text-white"
              disabled={selectedProducts.length === 0 || sending}
              onClick={() => setConfirmOpen(true)}
            >
              <Send /> Email küldés
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {users?.length ?? 0} felhasználónak küldjük ki. Biztos?
              </span>
              <Button
                size="sm"
                className="bg-[#E2450C] hover:bg-[#c93a09] text-white"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? 'Küldés…' : 'Igen, küld!'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sending}>
                Mégse
              </Button>
            </div>
          )}

          {savedId && (
            <div className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-emerald-500">Mentve: </span>
              <span className="font-mono text-xs text-muted-foreground">{savedId}</span>
            </div>
          )}
        </div>

        {/* Send results */}
        {sendResults && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Küldési eredmény: {sendResults.filter((r) => r.status === 'sent').length}/{sendResults.length} sikeres
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {sendResults.map((r) => (
                <div
                  key={r.userId}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm border ${
                    r.status === 'sent'
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  {r.status === 'sent' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.status === 'sent' ? r.email : r.error ?? 'hiba'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export type { CampaignType };
