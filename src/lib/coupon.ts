// Phase 4: coupon helpers — deterministic code + personalised email HTML template.
// Pure functions, shared between the Worker (send route) and the coupon page.

import type { Product } from './scoring';
import { daysUntil, discountFor } from './scoring';

// ---------------------------------------------------------------------------
// Deterministic coupon code: NAGYA-{sku}-{hash(userId+sku)}
// Non-cryptographic — just needs to be stable per (user, sku) pair.
// ---------------------------------------------------------------------------
export function couponCode(sku: string, userId: number): string {
  const source = `${userId}::${sku}`;
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `NAGYA-${sku}-${hex}`;
}

// ---------------------------------------------------------------------------
// Per-item discounted price (uses the same discount ladder as the composer).
// ---------------------------------------------------------------------------
export interface PricedItem {
  sku: string;
  title: string;
  category: string;
  imageUrl: string;
  originalPrice: number;
  finalPrice: number;
  discountPct: number;
  code: string;
  daysLeft: number;
  expirationDate: string;
}

export function priceItem(product: Product, userId: number, today = new Date()): PricedItem {
  const daysLeft = daysUntil(product.expiration_date, today);
  const { pct } = discountFor(daysLeft);
  // Baseline coupon discount: every item gets at least 10% off so the coupon feels real
  const effectivePct = Math.max(pct, 10);
  const finalPrice = Math.max(
    10,
    Math.round((product.price.value * (1 - effectivePct / 100)) / 10) * 10,
  );
  return {
    sku: product.sku,
    title: product.title,
    category: product.category,
    imageUrl: `/images/${product.sku}.webp`,
    originalPrice: product.price.value,
    finalPrice,
    discountPct: effectivePct,
    code: couponCode(product.sku, userId),
    daysLeft,
    expirationDate: product.expiration_date,
  };
}

// ---------------------------------------------------------------------------
// Email HTML — ALDI-style, inline CSS, email-client-safe tables.
// Placeholder substitution: {{product[N].title}} is replaced by item values.
// Public assets (logo, product images) must be reachable over HTTPS for the
// email client to load them — that is why we pass an absolute origin in.
// ---------------------------------------------------------------------------
export interface EmailContext {
  origin: string;            // e.g. https://nagya-dashboard.workers.dev
  userName: string;
  userGreetingCategory: string;
  items: PricedItem[];
  couponUrl: string;
  campaignLabel: string;
  validUntil: string;        // human-readable, e.g. "2026.04.30"
  senderName: string;
}

const BLUE = '#003865';
const ORANGE = '#E2450C';
const LIGHT_BLUE = '#1FC4F4';
const YELLOW = '#FFD000';
const INK = '#111111';
const MUTED = '#6b6b6b';
const LIGHT_BG = '#faf8f4';

const fmtHUF = (n: number) =>
  new Intl.NumberFormat('hu-HU').format(n) + ' Ft';

export function renderEmailHtml(ctx: EmailContext): string {
  const firstName = ctx.userName.split(' ').slice(-1)[0] ?? ctx.userName;

  const rows = ctx.items
    .map(
      (it) => `
      <tr>
        <td width="72" style="padding:8px;vertical-align:top;">
          <img src="cid:img-${it.sku}" width="64" height="64" alt=""
               style="display:block;border-radius:6px;object-fit:cover;background:${LIGHT_BG};">
        </td>
        <td style="padding:8px 8px 8px 0;font-family:Arial,sans-serif;color:${INK};">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${BLUE};font-weight:700;">
            ${escapeHtml(it.category)}
          </div>
          <div style="font-size:15px;font-weight:800;color:${BLUE};line-height:1.2;margin-top:2px;">
            ${escapeHtml(it.title)}
          </div>
          <div style="margin-top:6px;">
            ${it.discountPct > 0
              ? `<span style="color:${MUTED};text-decoration:line-through;font-size:12px;">${fmtHUF(it.originalPrice)}</span>
                 <span style="color:${ORANGE};font-size:18px;font-weight:900;margin-left:6px;">${fmtHUF(it.finalPrice)}</span>
                 <span style="background:${ORANGE};color:#fff;font-size:10px;font-weight:900;padding:2px 6px;border-radius:3px;margin-left:4px;vertical-align:middle;">−${it.discountPct}%</span>`
              : `<span style="color:${ORANGE};font-size:18px;font-weight:900;">${fmtHUF(it.finalPrice)}</span>`}
          </div>
          <div style="font-family:'Courier New',monospace;font-size:11px;color:${MUTED};margin-top:6px;letter-spacing:0.04em;">
            ${escapeHtml(it.code)}
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const totalSaved = ctx.items.reduce(
    (s, it) => s + Math.max(0, it.originalPrice - it.finalPrice),
    0,
  );

  return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(ctx.campaignLabel)}</title>
</head>
<body style="margin:0;padding:0;background:${LIGHT_BG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${LIGHT_BG};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <!-- Masthead -->
        <tr><td style="background:${BLUE};padding:24px 28px;border-bottom:6px solid ${YELLOW};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="color:#fff;font-family:Arial,sans-serif;">
                <div style="font-size:10px;letter-spacing:0.2em;font-weight:700;opacity:0.85;text-transform:uppercase;">
                  ${escapeHtml(ctx.campaignLabel)}
                </div>
                <div style="font-size:24px;font-weight:900;margin-top:4px;letter-spacing:-0.01em;">
                  ${escapeHtml(firstName)}, a heti kedvenceid
                </div>
                <div style="font-size:12px;opacity:0.85;margin-top:4px;">
                  Kedvenc kategóriád: <strong style="color:${YELLOW};">${escapeHtml(ctx.userGreetingCategory)}</strong>
                </div>
              </td>
              <td align="right" valign="top" style="font-family:Arial,sans-serif;">
                <div style="background:${ORANGE};color:#fff;font-weight:900;font-size:22px;padding:10px 14px;border-radius:6px;display:inline-block;line-height:1;">
                  −${ctx.items.length > 0 ? Math.round(ctx.items.reduce((s, i) => s + i.discountPct, 0) / ctx.items.length) : 0}%
                  <div style="font-size:9px;font-weight:600;letter-spacing:0.08em;margin-top:3px;">ÁTLAG KEDVEZMÉNY</div>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 28px 8px;font-family:Arial,sans-serif;color:${INK};">
          <p style="margin:0 0 10px;font-size:14px;">Kedves ${escapeHtml(firstName)}!</p>
          <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.55;">
            Összeraktuk neked a heti legjobb ajánlatokat a kedvenceidből. A lenti kupon linket megnyitva
            letöltheted személyes PDF kupon füzetedet vonalkódokkal — mutasd be a pénztárnál érvényesítéshez.
          </p>
        </td></tr>

        <!-- Product rows -->
        <tr><td style="padding:8px 20px 8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${rows}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:16px 28px 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr><td align="center" bgcolor="${ORANGE}" style="border-radius:8px;">
              <a href="${ctx.couponUrl}"
                 style="display:inline-block;padding:14px 28px;background:${ORANGE};color:#ffffff;
                        font-family:Arial,sans-serif;font-weight:900;font-size:15px;text-decoration:none;
                        border-radius:8px;letter-spacing:0.02em;">
                ↓ &nbsp;Kupon füzet letöltése (PDF)
              </a>
            </td></tr>
          </table>
          <div style="margin-top:10px;font-size:11px;color:${MUTED};font-family:Arial,sans-serif;">
            ${ctx.items.length} kupon · összesen <strong style="color:${INK};">${fmtHUF(totalSaved)}</strong> megtakarítás · érvényes ${escapeHtml(ctx.validUntil)}-ig
          </div>
        </td></tr>

        <!-- Yellow accent -->
        <tr><td style="height:6px;background:${YELLOW};line-height:6px;font-size:0;">&nbsp;</td></tr>

        <!-- Footer -->
        <tr><td style="background:${LIGHT_BG};padding:18px 28px;font-family:Arial,sans-serif;text-align:center;">
          <div style="color:${BLUE};font-weight:800;font-size:13px;letter-spacing:0.08em;">ALDI · ${escapeHtml(ctx.senderName.toUpperCase())}</div>
          <div style="color:${MUTED};font-size:11px;margin-top:4px;">
            Ezt az emailt azért kapod, mert feliratkoztál a heti ajánlatainkra.
            A kuponok egyszer használhatók, maximum 1 db / vásárlás.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
