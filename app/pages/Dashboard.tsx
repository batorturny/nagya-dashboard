import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleDashed, Heart, Mail, Package, Sparkles, ThumbsDown } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Product = {
  id: number;
  sku: string;
  title: string;
  category: string;
  description: string;
  allergens: string[];
  expiration_date: string;
  price: { value: number; cost_price: number; bottle_deposit: number };
  stock: { current: number; last_7_day_sold: number };
};

type User = {
  id: number;
  name: string;
  email: string;
  favorite_category: string;
  least_purchased_category: string;
};

type ApiEnvelope<T> = {
  status: string;
  count: number;
  data: T[];
  categories?: string[];
};

const HUF = new Intl.NumberFormat('hu-HU');
const LOW_STOCK = 20;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function initials(name: string): string {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
}

const phases = [
  { num: '01', title: 'Product + inventory', desc: 'SKU, expiry, stock · live API', icon: Package, href: '/' },
  { num: '02', title: 'AI tagging', desc: 'Gemini Flash · season/weather tags', icon: Sparkles, href: '/' },
  { num: '03', title: 'Composer + time szezon', desc: 'Weather-aware · 1-10 products', icon: AlertTriangle, href: '/compose' },
  { num: '04', title: 'Send + PDF coupon', desc: 'Resend + Code128 barcode', icon: Mail, href: '/campaigns' },
] as const;

export function Dashboard() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<ApiEnvelope<User>>('/api/users'),
      fetchJson<ApiEnvelope<Product>>('/api/products'),
    ])
      .then(([u, p]) => {
        setUsers(u.data);
        setProducts(p.data);
        setCategories(p.categories ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    return activeCategory === 'all'
      ? products
      : products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Smart Newsletter</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Weather-aware, personalized product promos · Resend delivery · PDF coupons
          </p>
        </div>
        <Button asChild>
          <Link to="/compose">Kampány indítása</Link>
        </Button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {phases.map((p) => (
          <Card key={p.num} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <p.icon className="text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground tracking-widest">
                  PHASE {p.num}
                </span>
              </div>
              <CardTitle className="mt-2 text-base">{p.title}</CardTitle>
              <CardDescription className="text-xs">{p.desc}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">API error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Userek</h2>
          <span className="text-xs font-mono text-muted-foreground">
            /api/users {users ? `· ${users.length}` : ''}
          </span>
        </div>

        {!users ? (
          <LoadingRow />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map((u) => (
              <Card key={u.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{u.name}</CardTitle>
                      <CardDescription className="text-xs font-mono truncate">
                        {u.email}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="success" className="gap-1">
                      <Heart className="h-3 w-3" /> {u.favorite_category}
                    </Badge>
                    <Badge
                      variant="destructive"
                      className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      <ThumbsDown className="h-3 w-3" /> {u.least_purchased_category}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Termékek</h2>
          <span className="text-xs font-mono text-muted-foreground">
            /api/products {products ? `· ${visibleProducts.length} / ${products.length}` : ''}
          </span>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <CategoryChip
              label="Összes"
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={activeCategory === c}
                onClick={() => setActiveCategory(c)}
              />
            ))}
          </div>
        )}

        {!products ? (
          <LoadingRow />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleProducts.map((p) => (
              <ProductCard key={p.sku} product={p} />
            ))}
          </div>
        )}
      </section>

      <footer className="text-xs text-muted-foreground border-t border-border pt-4 flex items-center justify-between">
        <span>Phase 1 foundation · React 18 + shadcn/ui + Hono Worker</span>
        <span>Snapshot {new Date().toISOString().slice(0, 10)}</span>
      </footer>
    </div>
  );
}

function LoadingRow() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <CircleDashed className="animate-spin" /> Betöltés…
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
        (active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border bg-background hover:bg-accent hover:text-accent-foreground')
      }
    >
      {label}
    </button>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const low = p.stock.current < LOW_STOCK;
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="aspect-square bg-muted/30 overflow-hidden border-b border-border">
        <img
          src={`/images/${p.sku}.webp`}
          alt={p.title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent && !parent.querySelector('[data-fallback]')) {
              const span = document.createElement('span');
              span.dataset.fallback = 'true';
              span.className =
                'h-full w-full flex items-center justify-center text-4xl text-muted-foreground/40';
              span.textContent = '📦';
              parent.appendChild(span);
            }
          }}
        />
      </div>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug">{p.title}</CardTitle>
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            {p.sku}
          </span>
        </div>
        <Badge variant="outline" className="w-fit">
          {p.category}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-end gap-2">
        <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold tabular-nums">{HUF.format(p.price.value)} Ft</span>
          <Badge variant={low ? 'warning' : 'secondary'}>
            {low ? '⚠ ' : ''}
            {p.stock.current} db
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
