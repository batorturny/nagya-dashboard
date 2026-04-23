import * as React from 'react';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PromoEmail } from '../emails/promo.tsx';
import { RESEND_API_KEY } from '../config.ts';

const resend = new Resend(RESEND_API_KEY);

export async function handleEmail(opts: {
  products: string[];
  prices: (number | undefined)[];
  gifPath: string;
  headline?: string;
  discountPct?: number;
  outDir: string;
  send: boolean;
}): Promise<void> {
  const { products, prices, gifPath, headline, discountPct, outDir, send } = opts;

  const gifSrc = send ? 'cid:promo-gif' : '/static/latest.gif';
  const element = React.createElement(PromoEmail, {
    products,
    prices,
    gifSrc,
    headline,
    discountPct,
  });
  const html = await render(element);

  const emailHtmlPath = path.join(outDir, 'email.html');
  await fs.writeFile(emailHtmlPath, html, 'utf-8');
  console.log(`  Email HTML saved: ${emailHtmlPath}`);

  if (!send) {
    console.log('  Run "pnpm email:dev" to preview at http://localhost:3000');
    return;
  }

  const bundleName = products
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' + ');
  const gifBuffer = await fs.readFile(gifPath);

  const { data, error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: ['delivered@resend.dev'],
    subject: `${bundleName} Bundle — Limited Time Deal!`,
    html,
    attachments: [
      {
        filename: 'promo.gif',
        content: gifBuffer,
        inlineContentId: 'promo-gif',
      },
    ],
  });

  if (error) {
    console.error('  Resend error:', error);
    return;
  }
  console.log(`  Sent! Email ID: ${data?.id}`);
  console.log('  View at: https://resend.com/emails');
}
