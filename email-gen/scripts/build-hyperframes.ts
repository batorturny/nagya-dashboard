import fs from 'node:fs/promises';
import path from 'node:path';

const HF_DIR = 'hf';

const TAGLINE_CHAR_DELAY = 0.045;
const PRODUCT_CHAR_DELAY = 0.055;
const CLIP_DURATION = 4.0;
const CLIP_SPACING = 3.8;
const OUTRO_DURATION = 2.8;
const OUTRO_OVERLAP = 0.3;
const EASES = ['power2.out', 'expo.out', 'power3.out', 'power1.out'];

// Wheat palette (intro + outro)
const WHEAT_BG = '#e8d5a3';
const WHEAT_PRIMARY = '#02205f';   // ALDI navy — high contrast on wheat
const WHEAT_SECONDARY = '#5c3a0a'; // warm dark brown

function charSpans(text: string, idPrefix: string): string {
  return text
    .split('')
    .map((char, i) => `<span id="${idPrefix}${i}" class="tw-char">${char === ' ' ? ' ' : char}</span>`)
    .join('');
}

function typewriterTweens(
  text: string,
  idPrefix: string,
  startTime: number,
  charDelay: number
): string {
  return text
    .split('')
    .map(
      (_, i) =>
        `    tl.set('#${idPrefix}${i}', { opacity: 1 }, ${(startTime + i * charDelay).toFixed(3)});`
    )
    .join('\n');
}

export async function buildHyperframesComposition(
  imagePaths: string[],
  products: string[],
  prices: (number | undefined)[],
  tagline?: string,
  discountPct?: number
): Promise<void> {
  await fs.mkdir(path.join(HF_DIR, 'assets'), { recursive: true });

  for (let i = 0; i < imagePaths.length; i++) {
    await fs.copyFile(imagePaths[i], path.join(HF_DIR, 'assets', `product-${i + 1}.png`));
  }

  // Copy ALDI logo if available
  let hasLogo = false;
  try {
    await fs.copyFile('emails/static/aldi-logo.svg', path.join(HF_DIR, 'assets', 'aldi-logo.svg'));
    hasLogo = true;
  } catch { /* no logo, render text-only outro */ }

  const n = imagePaths.length;
  const kickerText = `${n}-ITEM BUNDLE`;
  const sloganText = (tagline ?? 'BUNDLE DEAL').toUpperCase();

  // --- Timing ---
  const taglineStart = 0.15;
  const taglineDuration = kickerText.length * TAGLINE_CHAR_DELAY;
  const productNameStart = taglineStart + taglineDuration + 0.2;
  const productNameDuration = sloganText.length * PRODUCT_CHAR_DELAY;
  const typewriterEndTime = productNameStart + productNameDuration;
  const headlineFadeStart = typewriterEndTime + 0.4;
  const headlineTotalDuration = headlineFadeStart + 0.4;

  const IMAGE_START = headlineFadeStart;
  const imageStarts = imagePaths.map((_, i) => IMAGE_START + i * CLIP_SPACING);
  const imageDurations = imagePaths.map(() => CLIP_DURATION);
  const lastImageEnd = imageStarts[n - 1] + CLIP_DURATION;

  const outroStart = lastImageEnd - OUTRO_OVERLAP;
  const totalDuration = outroStart + OUTRO_DURATION;

  // --- Image tags ---
  const imageTags = imagePaths
    .map(
      (_, i) =>
        `  <img id="f${i + 1}" class="clip" data-start="${imageStarts[i].toFixed(2)}" data-duration="${imageDurations[i].toFixed(1)}" data-track-index="${i + 1}" src="assets/product-${i + 1}.png" />`
    )
    .join('\n');

  // --- Image tweens ---
  const imageTweens = imagePaths
    .map((_, i) => {
      const start = imageStarts[i].toFixed(2);
      const ease = EASES[i % EASES.length];
      const lines = [
        `    tl.from('#f${i + 1}', { scale: 1.12, opacity: 0, duration: 0.5, ease: '${ease}' }, ${start});`,
        `    tl.to('#f${i + 1}', { scale: 1.03, duration: ${(CLIP_DURATION - 0.5).toFixed(1)}, ease: 'none' }, ${(imageStarts[i] + 0.5).toFixed(2)});`,
      ];
      if (i < n - 1) {
        const fadeStart = (imageStarts[i] + CLIP_SPACING - 0.15).toFixed(2);
        lines.push(`    tl.to('#f${i + 1}', { opacity: 0, duration: 0.2, ease: 'power2.in' }, ${fadeStart});`);
      } else {
        // last image fades into outro
        lines.push(`    tl.to('#f${i + 1}', { opacity: 0, duration: ${OUTRO_OVERLAP.toFixed(1)}, ease: 'power2.in' }, ${(lastImageEnd - OUTRO_OVERLAP).toFixed(2)});`);
      }
      return lines.join('\n');
    })
    .join('\n');

  // --- Per-item promo overlays ---
  const promoHtmlParts: string[] = [];
  const promoTweenParts: string[] = [];

  for (let i = 0; i < n; i++) {
    const promoStart = imageStarts[i] + 0.65;
    const promoTrackIndex = n + 1 + i;
    const promoClipEnd = i < n - 1
      ? imageStarts[i] + CLIP_SPACING - 0.1
      : lastImageEnd - OUTRO_OVERLAP;
    const promoClipDuration = promoClipEnd - promoStart;

    const price = prices[i];
    const hasPrice = price !== undefined;
    const hasDiscount = discountPct !== undefined;
    const hasBoth = hasPrice && hasDiscount;
    const discountedPrice = hasBoth ? price! * (1 - discountPct! / 100) : undefined;

    let priceEl = '';
    if (hasBoth) {
      priceEl = `      <div class="promo-original-wrap">
        <span id="promo-orig-${i + 1}" class="promo-original">$${price!.toFixed(2)}</span>
        <div id="promo-strike-${i + 1}" class="promo-strike"></div>
      </div>
      <div id="promo-price-${i + 1}" class="promo-price">$${discountedPrice!.toFixed(2)}</div>`;
    } else if (hasPrice) {
      priceEl = `      <div id="promo-price-${i + 1}" class="promo-price">$${price!.toFixed(2)}</div>`;
    }

    const badgeEl = hasDiscount
      ? `    <div id="promo-badge-${i + 1}" class="promo-badge">-${discountPct}%&nbsp;OFF</div>`
      : '';

    promoHtmlParts.push(
      `  <div id="item-promo-${i + 1}" class="clip" data-start="${promoStart.toFixed(2)}" data-duration="${promoClipDuration.toFixed(2)}" data-track-index="${promoTrackIndex}">
    <div class="promo-gradient"></div>
    <div class="promo-bottom">
      <div class="promo-text">
        <div id="promo-name-${i + 1}" class="promo-name">${products[i].toUpperCase()}</div>
${priceEl}
      </div>
${badgeEl}
    </div>
  </div>`
    );

    const tweens: string[] = [
      `    tl.from('#item-promo-${i + 1} .promo-text', { y: 28, opacity: 0, duration: 0.45, ease: 'power2.out' }, ${promoStart.toFixed(2)});`,
    ];
    if (hasBoth) {
      tweens.push(`    tl.from('#promo-orig-${i + 1}', { opacity: 0, duration: 0.3, ease: 'power2.out' }, ${(promoStart + 0.2).toFixed(2)});`);
      tweens.push(`    tl.to('#promo-strike-${i + 1}', { scaleX: 1, duration: 0.38, ease: 'power2.inOut' }, ${(promoStart + 0.42).toFixed(2)});`);
      tweens.push(`    tl.from('#promo-price-${i + 1}', { scale: 0.55, opacity: 0, duration: 0.42, ease: 'back.out(2)' }, ${(promoStart + 0.65).toFixed(2)});`);
    } else if (hasPrice) {
      tweens.push(`    tl.from('#promo-price-${i + 1}', { scale: 0.55, opacity: 0, duration: 0.4, ease: 'back.out(2)' }, ${(promoStart + 0.3).toFixed(2)});`);
    }
    if (hasDiscount) {
      const badgeDelay = hasBoth ? 0.92 : hasPrice ? 0.6 : 0.3;
      tweens.push(`    tl.from('#promo-badge-${i + 1}', { rotation: 80, scale: 0, opacity: 0, duration: 0.4, ease: 'back.out(2.5)' }, ${(promoStart + badgeDelay).toFixed(2)});`);
    }
    if (i < n - 1) {
      tweens.push(`    tl.to('#item-promo-${i + 1}', { opacity: 0, duration: 0.2 }, ${(promoClipEnd - 0.1).toFixed(2)});`);
    } else {
      tweens.push(`    tl.to('#item-promo-${i + 1}', { opacity: 0, duration: ${OUTRO_OVERLAP.toFixed(1)} }, ${(promoClipEnd).toFixed(2)});`);
    }
    promoTweenParts.push(tweens.join('\n'));
  }

  // --- Typewriter ---
  const taglineHtml = charSpans(kickerText, 'tg');
  const productHtml = charSpans(sloganText, 'pn');
  const twTagline = typewriterTweens(kickerText, 'tg', taglineStart, TAGLINE_CHAR_DELAY);
  const twProduct = typewriterTweens(sloganText, 'pn', productNameStart, PRODUCT_CHAR_DELAY);

  // Track indices: images 1..n, promos n+1..2n, intro 2n+1, outro 2n+2
  const introTrackIndex = 2 * n + 1;
  const outroTrackIndex = 2 * n + 2;

  const logoEl = hasLogo
    ? `    <img id="outro-logo" src="assets/aldi-logo.svg" alt="ALDI" />`
    : `    <div id="outro-logo-text">ALDI</div>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body>
<div data-composition-id="promo" data-start="0" data-duration="${totalDuration.toFixed(1)}" data-width="640" data-height="640">
${imageTags}
${promoHtmlParts.join('\n')}
  <div id="scene-intro" class="clip" data-start="0" data-duration="${headlineTotalDuration.toFixed(2)}" data-track-index="${introTrackIndex}">
    <div class="intro-inner">
      <div id="tagline-row">${taglineHtml}</div>
      <div id="product-row">${productHtml}</div>
    </div>
  </div>
  <div id="scene-outro" class="clip" data-start="${outroStart.toFixed(2)}" data-duration="${(OUTRO_DURATION + 0.05).toFixed(2)}" data-track-index="${outroTrackIndex}">
    <div class="outro-inner">
${logoEl}
      <div id="outro-slogan">LIKE BRANDS. ONLY CHEAPER.</div>
    </div>
  </div>
  <div
    id="grain-overlay"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100;"
  >
    <div class="grain-texture"></div>
  </div>
  <style>
    @keyframes hf-grain-noise {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-5%, -5%); }
      20% { transform: translate(-10%, 5%); }
      30% { transform: translate(5%, -10%); }
      40% { transform: translate(-5%, 15%); }
      50% { transform: translate(-10%, 5%); }
      60% { transform: translate(15%, 0); }
      70% { transform: translate(0, 10%); }
      80% { transform: translate(-15%, 0); }
      90% { transform: translate(10%, 5%); }
    }
    #grain-overlay .grain-texture {
      position: absolute; top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: 0.14;
      mix-blend-mode: overlay;
      animation: hf-grain-noise 0.5s steps(1) infinite;
    }
  </style>
  <style>
    [data-composition-id="promo"] {
      position: relative; width: 640px; height: 640px;
      background: #111; overflow: hidden;
      font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    }
    [data-composition-id="promo"] img.clip {
      position: absolute; width: 100%; height: 100%; object-fit: cover;
    }
    /* ── Intro (wheat) ─────────────────────────── */
    #scene-intro {
      position: absolute; inset: 0;
      background: ${WHEAT_BG};
      display: flex; align-items: center; justify-content: center;
    }
    .intro-inner { text-align: center; padding: 48px 60px; }
    #tagline-row {
      font-size: 14px; font-weight: 800;
      letter-spacing: 0.35em; color: ${WHEAT_SECONDARY};
      text-transform: uppercase; margin-bottom: 24px;
    }
    #product-row {
      font-size: 40px; font-weight: 900;
      letter-spacing: 0.03em; color: ${WHEAT_PRIMARY};
      line-height: 1.15; word-break: break-word;
    }
    .tw-char { opacity: 0; }
    /* ── Per-item promo ────────────────────────── */
    [id^="item-promo-"] {
      position: absolute; inset: 0; pointer-events: none;
    }
    .promo-gradient {
      position: absolute; bottom: 0; left: 0; right: 0; height: 280px;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 55%, transparent 100%);
    }
    .promo-bottom {
      position: absolute; bottom: 30px; left: 32px; right: 32px;
      display: flex; align-items: flex-end; justify-content: space-between;
    }
    .promo-text { display: flex; flex-direction: column; gap: 2px; }
    .promo-name {
      font-size: 20px; font-weight: 800;
      letter-spacing: 0.14em; color: rgba(255,255,255,0.78);
      text-transform: uppercase;
    }
    .promo-original-wrap { position: relative; display: inline-block; }
    .promo-original {
      font-size: 24px; font-weight: 700; color: rgba(255,255,255,0.45);
    }
    .promo-strike {
      position: absolute; top: 52%; left: 0; right: 0;
      height: 2px; background: rgba(255,80,80,0.9);
      transform-origin: left center; transform: scaleX(0);
    }
    .promo-price {
      font-size: 64px; font-weight: 900; color: #f0a500;
      line-height: 1; letter-spacing: -0.02em;
      text-shadow: 0 0 32px rgba(240,165,0,0.4);
    }
    .promo-badge {
      background: #ff3d3d; color: #fff;
      font-size: 17px; font-weight: 900; letter-spacing: 0.08em;
      padding: 8px 18px; border-radius: 50px;
      text-transform: uppercase; transform: rotate(3deg);
      margin-bottom: 6px;
    }
    /* ── Outro (wheat) ─────────────────────────── */
    #scene-outro {
      position: absolute; inset: 0;
      background: ${WHEAT_BG};
      display: flex; align-items: center; justify-content: center;
    }
    .outro-inner { text-align: center; }
    #outro-logo { width: 90px; height: auto; margin-bottom: 28px; display: block; margin-left: auto; margin-right: auto; }
    #outro-logo-text {
      font-size: 56px; font-weight: 900; color: ${WHEAT_PRIMARY};
      letter-spacing: 0.12em; margin-bottom: 24px;
    }
    #outro-slogan {
      font-size: 22px; font-weight: 800;
      color: ${WHEAT_SECONDARY}; letter-spacing: 0.2em;
      text-transform: uppercase;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // Typewriter: tagline
${twTagline}

    // Typewriter: product name
${twProduct}

    // Intro fade out
    tl.to('#scene-intro', { opacity: 0, duration: 0.38, ease: 'power2.in' }, ${headlineFadeStart.toFixed(2)});

    // Product images
${imageTweens}

    // Per-item promos
${promoTweenParts.join('\n')}

    // Outro slide
    tl.from('#scene-outro', { opacity: 0, duration: 0.45, ease: 'power2.out' }, ${outroStart.toFixed(2)});
    tl.from('${hasLogo ? '#outro-logo' : '#outro-logo-text'}', { scale: 0.7, opacity: 0, duration: 0.5, ease: 'back.out(1.5)' }, ${(outroStart + 0.3).toFixed(2)});
    tl.from('#outro-slogan', { y: 16, opacity: 0, duration: 0.5, ease: 'power2.out' }, ${(outroStart + 0.7).toFixed(2)});

    window.__timelines['promo'] = tl;
  </script>
</div>
</body>
</html>`;

  await fs.writeFile(path.join(HF_DIR, 'index.html'), html, 'utf-8');
  console.log(`  Composition written to ${HF_DIR}/index.html (${totalDuration.toFixed(1)}s)`);
}
