import { useEffect, useMemo, useState } from 'react';
import aldiLogo from '@/assets/aldi-it-logo.png';

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

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function daysLeft(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function initials(name: string): string {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
}

export function App() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    Promise.all([
      fetchJson<ApiEnvelope<User>>('/api/users'),
      fetchJson<ApiEnvelope<Product>>('/api/products'),
    ]).then(([u, p]) => {
      setUsers(u.data);
      setProducts(p.data);
      setCategories(p.categories ?? []);
    });
  }, []);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    const filtered = activeCategory === 'all'
      ? products
      : products.filter((p) => p.category === activeCategory);
    return [...filtered].sort((a, b) => daysLeft(a.expiration_date) - daysLeft(b.expiration_date));
  }, [products, activeCategory]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900">

      {/* Navbar */}
      <nav className="bg-[#003865] text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={aldiLogo}
              alt="ALDI"
              className="h-11 w-11 rounded object-cover"
            />
            <div>
              <div className="text-[11px] uppercase tracking-widest text-white/60 font-medium">
                ALDI International IT Services
              </div>
              <div className="text-lg font-bold leading-tight">
                Promóciós hírlevél
              </div>
            </div>
          </div>
          <button className="text-sm border border-white/30 rounded px-4 py-1.5 hover:bg-white/10 transition-colors">
            Hírlevél összeállítása
          </button>
        </div>
        <div className="h-[3px] bg-[#E2450C]" />
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* Customers */}
        {users && (
          <section>
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Vásárlók
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {users.map((u) => (
                <div key={u.id} className="bg-white rounded border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-full bg-[#003865] text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{u.name}</div>
                      <div className="text-xs text-gray-400 truncate">{u.email}</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">
                      Kedvenc: <span className="text-[#003865] font-medium">{u.favorite_category}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Kerüli: <span className="text-gray-400">{u.least_purchased_category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category nav */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wider">
              Termékek {visibleProducts.length > 0 && <span className="text-gray-400 font-normal normal-case tracking-normal text-sm">({visibleProducts.length} db)</span>}
            </h2>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-0 border-b border-gray-200">
              <CategoryTab label="Összes" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
              {categories.map((c) => (
                <CategoryTab key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
              ))}
            </div>
          )}

          {!products ? (
            <div className="text-sm text-gray-400 py-8 text-center">Betöltés…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {visibleProducts.map((p) => (
                <ProductCard key={p.sku} product={p} />
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-gray-400">
          <span>© 2026 ALDI International IT Services Kft.</span>
          <span>Alacsony árak. Magas minőség.</span>
        </div>
      </footer>
    </div>
  );
}

function CategoryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ' +
        (active
          ? 'border-[#E2450C] text-[#003865]'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300')
      }
    >
      {label}
    </button>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const days = daysLeft(p.expiration_date);

  const discount =
    days <= 1 ? 50 :
    days === 2 ? 20 :
    days === 3 ? null : null;

  const discountedPrice = discount
    ? Math.round(p.price.value * (1 - discount / 100))
    : null;

  const urgencyLabel =
    days <= 0 ? { text: 'Lejárt', cls: 'bg-gray-500 text-white' } :
    days === 1 ? { text: 'Ma az utolsó nap', cls: 'bg-[#E2450C] text-white' } :
    days === 2 ? { text: 'Holnap lejár', cls: 'bg-[#E2450C] text-white' } :
    days === 3 ? { text: 'Hamarosan lejár', cls: 'bg-[#003865] text-white' } :
    null;

  return (
    <div className="bg-white rounded border border-gray-200 flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative aspect-square bg-gray-50">
        <img
          src={`/images/${p.sku}.webp`}
          alt={p.title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        {urgencyLabel && (
          <span className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded ${urgencyLabel.cls}`}>
            {urgencyLabel.text}
          </span>
        )}
        {discount && (
          <span className="absolute top-2 right-2 bg-[#E2450C] text-white text-xs font-bold px-2 py-0.5 rounded">
            -{discount}%
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1 gap-1">
        <div className="text-[11px] text-gray-400">{p.category}</div>
        <div className="text-sm font-semibold leading-snug line-clamp-2">{p.title}</div>
        <div className="mt-auto pt-2 flex items-end justify-between gap-1">
          <div>
            {discountedPrice ? (
              <>
                <div className="text-[11px] text-gray-400 line-through">{HUF.format(p.price.value)} Ft</div>
                <div className="text-base font-bold text-[#E2450C]">{HUF.format(discountedPrice)} Ft</div>
              </>
            ) : (
              <div className="text-base font-bold text-gray-900">{HUF.format(p.price.value)} Ft</div>
            )}
          </div>
          <div className="text-[11px] text-gray-400 text-right">
            {p.stock.current} db
          </div>
        </div>
      </div>
    </div>
  );
}
