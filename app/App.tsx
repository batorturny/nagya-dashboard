import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleDashed,
  Database,
  Mail,
  Package,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  expiration_date: string;
  price: { value: number };
  stock: { current: number };
};

type User = {
  id: number;
  name: string;
  email: string;
  favorite_category: string;
  least_purchased_category: string;
};

type ApiResponse<T> = { status: string; count: number; data: T[] };

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

const phases = [
  {
    num: '01',
    title: 'Termék + inventory scan',
    desc: 'SKU, lejárat, stock · ≤3 nap flag',
    icon: Package,
  },
  {
    num: '02',
    title: 'AI tag + bundle detection',
    desc: 'Gemini Flash tageli, párosításokat javasol',
    icon: Sparkles,
  },
  {
    num: '03',
    title: 'Composer + weather',
    desc: 'Open-Meteo, 1-10 termék/email, preview',
    icon: Database,
  },
  {
    num: '04',
    title: 'Küldés + PDF kupon',
    desc: 'Resend, vonalkód, perszonalizált',
    icon: Mail,
  },
];

export function App() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<ApiResponse<User>>('/api/users'),
      fetchJson<ApiResponse<Product>>('/api/products'),
    ])
      .then(([u, p]) => {
        setUsers(u.data);
        setProducts(p.data);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              nagya.app · Smart Newsletter
            </h1>
            <p className="text-muted-foreground mt-1">
              Weather-aware, personalized product promos · Resend delivery · PDF coupons
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <a href="https://github.com/batorturny/nagya-dashboard" target="_blank" rel="noreferrer">
              GitHub
              <ArrowRight />
            </a>
          </Button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {phases.map((p) => (
            <Card key={p.num} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <p.icon className="text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {p.num}
                  </span>
                </div>
                <CardTitle className="mt-2">{p.title}</CardTitle>
                <CardDescription>{p.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Live API · /api/users</CardTitle>
              <CardDescription>Worker → api.nagya.app proxy · 60s edge cache</CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-destructive text-sm">Hiba: {error}</p>
              ) : users === null ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <CircleDashed className="animate-spin" />
                  Betöltés…
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {users.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {u.favorite_category}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live API · /api/products</CardTitle>
              <CardDescription>
                {products ? `${products.length} termék` : 'Betöltés...'} · live fetch
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-destructive text-sm">Hiba: {error}</p>
              ) : products === null ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <CircleDashed className="animate-spin" />
                  Betöltés…
                </div>
              ) : (
                <ul className="space-y-1 text-sm max-h-64 overflow-auto pr-1">
                  {products.slice(0, 12).map((p) => (
                    <li
                      key={p.sku}
                      className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent/50"
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.sku}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="text-xs text-muted-foreground border-t border-border pt-4">
          Phase 1 foundation · React 18 + shadcn/ui + Hono Worker · Snapshot 2026-04-23
        </footer>
      </div>
    </main>
  );
}
