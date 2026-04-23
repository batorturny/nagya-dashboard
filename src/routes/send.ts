import type { Context } from 'hono';

interface Bindings {
  CAMPAIGNS: KVNamespace;
  NAGYA_API_BASE: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  RESEND_API_KEY?: string;
}

interface Product {
  id: number;
  sku: string;
  title: string;
  category: string;
  description: string;
  expiration_date: string;
  price: { value: number; cost_price: number; bottle_deposit: number };
  stock: { current: number; last_7_day_sold: number };
}

interface User {
  id: number;
  name: string;
  email: string;
  favorite_category: string;
  least_purchased_category: string;
}

interface SendBody {
  campaignId?: string;
  products?: Product[];
  users?: User[];
  perUser?: Array<{ userId: number; skus: string[] }>;
}

interface SendResult {
  userId: number;
  name: string;
  email: string;
  status: 'sent' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysLeft(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function discountPct(days: number): number {
  if (days <= 1) return 50;
  if (days === 2) return 20;
  return 0;
}

function couponCode(userId: number, sku: string): string {
  const raw = `${userId}-${sku}-ALDI2026`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `ALDI-${sku}-${Math.abs(hash).toString(36).toUpperCase().slice(0, 6)}`;
}

function formatHUF(value: number): string {
  return new Intl.NumberFormat('hu-HU').format(value) + ' Ft';
}

// ---------------------------------------------------------------------------
// HTML email template
// ---------------------------------------------------------------------------

function buildEmailHtml(user: User, products: Product[]): string {
  const firstName = user.name.split(' ').pop() ?? user.name;

  const productCards = products
    .map((p) => {
      const days = daysLeft(p.expiration_date);
      const discount = discountPct(days);
      const discountedPrice = discount > 0 ? Math.round(p.price.value * (1 - discount / 100)) : null;
      const code = couponCode(user.id, p.sku);

      const urgencyBanner =
        days <= 0
          ? `<div style="background:#6b7280;color:#fff;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.05em;display:inline-block;border-radius:3px;margin-bottom:8px;">LEJÁRT</div>`
          : days === 1
          ? `<div style="background:#E2450C;color:#fff;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.05em;display:inline-block;border-radius:3px;margin-bottom:8px;">⚡ Ma az utolsó nap</div>`
          : days === 2
          ? `<div style="background:#E2450C;color:#fff;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.05em;display:inline-block;border-radius:3px;margin-bottom:8px;">🔥 Holnap lejár</div>`
          : days === 3
          ? `<div style="background:#003865;color:#fff;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.05em;display:inline-block;border-radius:3px;margin-bottom:8px;">⏰ Hamarosan lejár</div>`
          : '';

      const priceBlock = discountedPrice
        ? `<div style="margin-top:8px;">
            <span style="text-decoration:line-through;color:#9ca3af;font-size:13px;">${formatHUF(p.price.value)}</span>
            <span style="color:#E2450C;font-size:20px;font-weight:800;margin-left:8px;">${formatHUF(discountedPrice)}</span>
            <span style="background:#E2450C;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;margin-left:6px;">-${discount}%</span>
           </div>`
        : `<div style="margin-top:8px;font-size:18px;font-weight:700;color:#111827;">${formatHUF(p.price.value)}</div>`;

      return `
        <tr>
          <td style="padding:16px;border-bottom:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="90" style="padding-right:16px;vertical-align:top;">
                  <img src="https://nagya-dashboard.nagya.workers.dev/images/${p.sku}.webp"
                    alt="${p.title}" width="80" height="80"
                    style="border-radius:6px;object-fit:cover;display:block;border:1px solid #e5e7eb;" />
                </td>
                <td style="vertical-align:top;">
                  ${urgencyBanner}
                  <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">${p.title}</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${p.category}</div>
                  ${priceBlock}
                  ${discount > 0 ? `
                  <div style="margin-top:10px;background:#f9fafb;border:1px dashed #d1d5db;border-radius:6px;padding:8px 12px;display:inline-block;">
                    <div style="font-size:10px;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;">Kuponkód</div>
                    <div style="font-size:15px;font-weight:800;color:#003865;font-family:monospace;letter-spacing:.1em;">${code}</div>
                    <div style="font-size:10px;color:#9ca3af;margin-top:2px;">Mutasd be a pénztárnál</div>
                  </div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#003865;padding:20px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:rgba(255,255,255,.6);font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;">ALDI International IT Services</div>
                  <div style="color:#fff;font-size:20px;font-weight:800;margin-top:2px;">Személyre szabott ajánlatok</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="height:3px;background:#E2450C;"></td></tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 28px 8px;">
            <div style="font-size:16px;color:#111827;">Kedves <strong>${firstName}</strong>!</div>
            <div style="font-size:14px;color:#6b7280;margin-top:6px;line-height:1.6;">
              Személyre szabott ajánlatokat válogattunk össze számodra a kedvenc kategóriád (<strong>${user.favorite_category}</strong>) alapján.
              A kuponokat mutasd be bármely ALDI pénztárnál!
            </div>
          </td>
        </tr>

        <!-- Products -->
        <tr>
          <td style="padding:8px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;overflow:hidden;">
              ${productCards}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 28px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <div style="font-size:11px;color:#9ca3af;line-height:1.6;">
              Az ajánlatok az aktuális készlet erejéig érvényesek. A kedvezmények a feltüntetett lejárati dátumig érvényesek.<br>
              © 2026 ALDI Magyarország Élelmiszer Bt. · <a href="#" style="color:#003865;">Leiratkozás</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function sendHandler(c: Context<{ Bindings: Bindings }>) {
  const demoMode = !c.env.RESEND_API_KEY;

  const body = await c.req.json<SendBody>();

  let products: Product[] = [];
  let users: User[] = [];
  let perUser: Array<{ userId: number; skus: string[] }> = [];

  // Load from campaignId or use inline payload
  if (body.campaignId) {
    const saved = await c.env.CAMPAIGNS.get(body.campaignId, 'json') as {
      productSkus: string[];
      created_for: Array<{ userId: number; skus: string[] }>;
    } | null;
    if (!saved) return c.json({ error: 'campaign_not_found' }, 404);
    perUser = saved.created_for;

    const [pRes, uRes] = await Promise.all([
      fetch(`${c.env.NAGYA_API_BASE}/products`),
      fetch(`${c.env.NAGYA_API_BASE}/users`),
    ]);
    products = ((await pRes.json()) as { data: Product[] }).data;
    users = ((await uRes.json()) as { data: User[] }).data;
  } else if (body.products && body.users) {
    products = body.products;
    users = body.users;
    perUser = body.perUser ?? users.map((u) => ({
      userId: u.id,
      skus: products.slice(0, 5).map((p) => p.sku),
    }));
  } else {
    return c.json({ error: 'Provide campaignId or {products, users}' }, 400);
  }

  const productMap = Object.fromEntries(products.map((p) => [p.sku, p]));

  // Send one email per user
  const results: SendResult[] = await Promise.all(
    users.map(async (user) => {
      const userPerUser = perUser.find((pu) => pu.userId === user.id);
      const userSkus = userPerUser?.skus ?? perUser[0]?.skus ?? products.slice(0, 5).map((p) => p.sku);
      const userProducts = userSkus.map((sku) => productMap[sku]).filter(Boolean);

      if (userProducts.length === 0) {
        return { userId: user.id, name: user.name, email: user.email, status: 'failed' as const, error: 'no_products' };
      }

      const html = buildEmailHtml(user, userProducts);
      const firstName = user.name.split(' ').pop() ?? user.name;

      if (demoMode) {
        return { userId: user.id, name: user.name, email: user.email, status: 'sent' as const };
      }

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${c.env.SENDER_NAME} <${c.env.SENDER_EMAIL}>`,
            to: [user.email],
            subject: `${firstName}, személyre szabott ajánlatok várnak! 🛒`,
            html,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          return { userId: user.id, name: user.name, email: user.email, status: 'failed' as const, error: err };
        }

        return { userId: user.id, name: user.name, email: user.email, status: 'sent' as const };
      } catch (e) {
        return { userId: user.id, name: user.name, email: user.email, status: 'failed' as const, error: String(e) };
      }
    }),
  );

  const sent = results.filter((r) => r.status === 'sent').length;
  return c.json({ sent, total: results.length, results, demo: demoMode });
}
