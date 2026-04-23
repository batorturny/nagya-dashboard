import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { generateProductImages } from './openai-images.ts';
import { buildHyperframesComposition } from './build-hyperframes.ts';
import { renderGif } from './render-gif.ts';
import { handleEmail } from './send-email.ts';

async function main() {
  const { values } = parseArgs({
    options: {
      products: { type: 'string' },
      prices: { type: 'string' },
      frames: { type: 'string' },
      promo: { type: 'string' },
      discount: { type: 'string' },
      send: { type: 'boolean', default: false },
    },
  });

  if (!values.products) {
    console.error(
      'Error: --products is required.  Example: pnpm generate --products "grill,charcoal" --prices "49.99,29.99" --discount 30'
    );
    process.exit(1);
  }

  const products = values.products
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (products.length === 0) {
    console.error('Error: at least one product name is required');
    process.exit(1);
  }

  const prices: (number | undefined)[] = values.prices
    ? values.prices.split(',').map((p) => {
        const v = parseFloat(p.trim());
        return isNaN(v) ? undefined : v;
      })
    : products.map(() => undefined);

  // Pad/trim to match product count
  while (prices.length < products.length) prices.push(undefined);
  prices.length = products.length;

  const frames = values.frames
    ? Math.max(1, parseInt(values.frames, 10))
    : products.length;
  const send = values.send ?? false;
  const promoTagline = values.promo;
  const discountPct = values.discount ? parseFloat(values.discount) : undefined;

  const slug = products.join('-').replace(/\s+/g, '_');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${slug}`;
  const outDir = path.join('out', runId);
  await fs.mkdir(outDir, { recursive: true });

  const priceDisplay = prices.some((p) => p !== undefined)
    ? prices.map((p, i) => `${products[i]}=${p !== undefined ? `$${p.toFixed(2)}` : 'n/a'}`).join(', ')
    : 'not set';

  console.log('\nProduct Bundle Promo Pipeline');
  console.log(`  Products : ${products.join(', ')}`);
  console.log(`  Prices   : ${priceDisplay}${discountPct !== undefined ? ` (${discountPct}% off)` : ''}`);
  console.log(`  Frames   : ${frames}`);
  console.log(`  Mode     : ${send ? 'send' : 'preview'}`);
  console.log(`  Output   : ${outDir}\n`);

  console.log('Step 1/4 — Generating images with gpt-image-1...');
  const imagePaths = await generateProductImages(products, frames, outDir);

  console.log('\nStep 2/4 — Building HyperFrames composition...');
  await buildHyperframesComposition(imagePaths, products, prices, promoTagline, discountPct);

  console.log('\nStep 3/4 — Rendering GIF...');
  const gifPath = await renderGif(outDir);

  console.log('\nStep 4/4 — Composing email...');
  await handleEmail({ products, prices, gifPath, headline: promoTagline, discountPct, outDir, send });

  console.log(`\nDone. Artifacts in: ${outDir}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
