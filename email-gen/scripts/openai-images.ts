import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OPENAI_API_KEY } from '../config.ts';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function generateProductImages(
  products: string[],
  frames: number,
  outDir: string
): Promise<string[]> {
  await fs.mkdir(path.join(outDir, 'images'), { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < frames; i++) {
    const product = products[i % products.length];
    const angleVariations = Math.ceil(frames / products.length);
    const angleNote = angleVariations > 1
      ? `, angle ${Math.floor(i / products.length) + 1} of ${angleVariations}`
      : '';
    const prompt =
      `Lifestyle marketing photo of a happy person actively using ${product} for a promotional email campaign, ` +
      `person is the clear focal point — engaged, natural expression, mid-action (e.g. using, holding, enjoying the ${product}), ` +
      `product is prominent and recognisable in their hands or immediate environment, ` +
      `bright airy background, warm commercial lighting, vibrant saturated colors that pop in email, ` +
      `no harsh shadows, sharp crisp focus, square composition, 4k photorealistic${angleNote}`;

    console.log(`  Generating image ${i + 1}/${frames} (${product})...`);
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    if (!b64) throw new Error(`No b64_json in response for frame ${i + 1}`);

    const imgPath = path.join(outDir, 'images', `product-${i + 1}.png`);
    await fs.writeFile(imgPath, Buffer.from(b64, 'base64'));
    console.log(`    Saved: ${imgPath}`);
    paths.push(imgPath);
  }

  return paths;
}
