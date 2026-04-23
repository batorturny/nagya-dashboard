import { useEffect, useState } from 'react';
import { CircleDashed, Inbox, Mailbox } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface SavedCampaign {
  id: string;
  type?: string;
  productSkus?: string[];
  created_at?: string;
  created_for?: Array<{ userId: number; skus: string[] }>;
}

export function Campaigns() {
  const [items, setItems] = useState<SavedCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((json: { campaigns: SavedCampaign[] }) => {
        const sorted = [...(json.campaigns ?? [])].sort((a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? ''),
        );
        setItems(sorted);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Mailbox className="text-muted-foreground" />
          Campaigns
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Mentett kampányok · KV-ban tárolva, Phase 4-ben küldhetők ki
        </p>
      </header>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Hiba a betöltéskor</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!items && !error && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <CircleDashed className="animate-spin" /> Betöltés…
        </div>
      )}

      {items && items.length === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <div className="text-sm">Még nincs mentett kampány.</div>
            <div className="text-xs">Menj a Composer-re, állíts össze egyet és mentsd el.</div>
          </CardContent>
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm capitalize">{c.type ?? 'egyedi'}</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {c.id.slice(0, 8)}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {c.created_at ? new Date(c.created_at).toLocaleString('hu-HU') : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Termékek: </span>
                  <span className="font-medium">{c.productSkus?.length ?? 0}</span>
                  {c.productSkus && c.productSkus.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.productSkus.slice(0, 8).map((sku) => (
                        <span
                          key={sku}
                          className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5"
                        >
                          {sku}
                        </span>
                      ))}
                      {c.productSkus.length > 8 && (
                        <span className="text-muted-foreground text-[10px]">
                          +{c.productSkus.length - 8}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {c.created_for && c.created_for.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Címzett userek: </span>
                    <span className="font-medium">{c.created_for.length}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
