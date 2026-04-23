import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface PromoEmailProps {
  products: string[];
  prices?: (number | undefined)[];
  gifSrc: string;
  greeting?: string;
  headline?: string;
  body?: string;
  ctaUrl?: string;
  discountPct?: number;
  pdfUrl?: string;
}

export function PromoEmail({
  products,
  prices = [],
  gifSrc,
  greeting = 'Hi there,',
  headline,
  body,
  ctaUrl = 'https://www.aldi.us',
  discountPct,
  pdfUrl,
}: PromoEmailProps) {
  const bundleName = products
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' & ');
  const h = headline ?? `${bundleName} — Unbeatable Value`;
  const b =
    body ??
    `This week at ALDI, we're bringing you the ${bundleName} bundle at prices that simply can't be beat. Quality you can trust, savings you can see — for a limited time only.`;

  const hasAnyPrice = prices.some((p) => p !== undefined);

  return (
    <Html lang="en">
      <Head />
      <Preview>{h}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>

          {/* ── Brand header ───────────────────────────────── */}
          <Section style={headerStyle}>
            <Img
              src="/static/aldi-logo.png"
              alt="ALDI"
              width={56}
              height={67}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </Section>

          {/* ── Yellow accent stripe ────────────────────────  */}
          <Section style={accentStripeStyle} />

          {/* ── Title ──────────────────────────────────────── */}
          <Section style={titleSectionStyle}>
            <Heading style={titleStyle}>{h}</Heading>
          </Section>

          {/* ── Greeting ───────────────────────────────────── */}
          <Section style={greetingSectionStyle}>
            <Text style={greetingStyle}>{greeting}</Text>
            <Text style={bodyTextStyle}>{b}</Text>
          </Section>

          {/* ── Product GIF ────────────────────────────────── */}
          <Section style={gifSectionStyle}>
            <Img
              src={gifSrc}
              alt={`${bundleName} bundle`}
              width={520}
              style={gifStyle}
            />
          </Section>

          {/* ── Price rows ─────────────────────────────────── */}
          {hasAnyPrice && (
            <Section style={priceTableStyle}>
              {products.map((product, i) => {
                const price = prices[i];
                const discounted =
                  price !== undefined && discountPct !== undefined
                    ? price * (1 - discountPct / 100)
                    : undefined;
                const cap =
                  product.charAt(0).toUpperCase() + product.slice(1);
                return (
                  <Section key={i} style={priceRowStyle}>
                    <Text style={priceProductStyle}>{cap}</Text>
                    {discounted !== undefined && price !== undefined && (
                      <Text style={oldPriceStyle}>${price.toFixed(2)}</Text>
                    )}
                    <Text style={newPriceStyle}>
                      ${(discounted ?? price!).toFixed(2)}
                    </Text>
                    {discountPct !== undefined && (
                      <Text style={saveBadgeStyle}>−{discountPct}%</Text>
                    )}
                  </Section>
                );
              })}
            </Section>
          )}

          {/* ── PDF download ───────────────────────────────── */}
          {pdfUrl && (
            <Section style={pdfSectionStyle}>
              <Text style={pdfLinkTextStyle}>
                <Link href={pdfUrl} style={pdfLinkStyle}>
                  ↓ &nbsp;Download Product Guide (PDF)
                </Link>
              </Text>
            </Section>
          )}

          {/* ── CTA ────────────────────────────────────────── */}
          <Section style={ctaSectionStyle}>
            <Button href={ctaUrl} style={buttonStyle}>
              Shop {bundleName} at ALDI &rarr;
            </Button>
          </Section>

          <Hr style={hrStyle} />

          {/* ── Footer ─────────────────────────────────────── */}
          <Section style={footerBandStyle}>
            <Text style={footerTaglineStyle}>LIKE BRANDS. ONLY CHEAPER.</Text>
          </Section>
          <Text style={footerStyle}>
            You received this because you opted in to ALDI seasonal alerts.{' '}
            <Link href="https://www.aldi.us" style={footerLinkStyle}>
              Unsubscribe
            </Link>
          </Text>

        </Container>
      </Body>
    </Html>
  );
}

PromoEmail.PreviewProps = {
  products: ['grill', 'charcoal'],
  prices: [49.99, 29.99],
  gifSrc: '/static/latest.gif',
  discountPct: 30,
  greeting: 'Hi there,',
  pdfUrl: 'https://www.aldi.us',
} satisfies PromoEmailProps;

export default PromoEmail;

/* ── Design tokens ───────────────────────────────────────────── */

const NAVY   = '#02205f';
const ORANGE = '#f47d20';
const YELLOW = '#ffc20e';
const WHEAT  = '#f5deb3';

/* ── Styles ──────────────────────────────────────────────────── */

const bodyStyle: React.CSSProperties = {
  backgroundColor: WHEAT,
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  padding: '40px 20px',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '520px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '4px',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: NAVY,
  padding: '20px 32px',
  textAlign: 'center',
};

const accentStripeStyle: React.CSSProperties = {
  backgroundColor: YELLOW,
  height: '6px',
  lineHeight: '6px',
  fontSize: '1px',
};

const titleSectionStyle: React.CSSProperties = {
  padding: '32px 32px 8px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: '900',
  color: NAVY,
  margin: '0',
  lineHeight: '1.2',
  letterSpacing: '-0.5px',
};

const greetingSectionStyle: React.CSSProperties = {
  padding: '16px 32px 24px',
};

const greetingStyle: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: '600',
  color: '#3d2800',
  margin: '0 0 10px',
};

const bodyTextStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#5a4020',
  lineHeight: '1.7',
  margin: '0',
};

const gifSectionStyle: React.CSSProperties = {
  lineHeight: '0',
  fontSize: '0',
};

const gifStyle: React.CSSProperties = {
  width: '100%',
  display: 'block',
};

const priceTableStyle: React.CSSProperties = {
  borderTop: `3px solid ${NAVY}`,
  margin: '0',
};

const priceRowStyle: React.CSSProperties = {
  padding: '12px 32px',
  borderBottom: `1px solid #e8d8b0`,
};

const priceProductStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '700',
  color: NAVY,
  margin: '0',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
};

const oldPriceStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#8a7050',
  textDecoration: 'line-through',
  margin: '2px 0 0',
};

const newPriceStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: '900',
  color: ORANGE,
  margin: '2px 0 0',
};

const saveBadgeStyle: React.CSSProperties = {
  backgroundColor: '#e8001c',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: '800',
  padding: '3px 9px',
  borderRadius: '20px',
  margin: '6px 0 0',
  display: 'inline-block',
  letterSpacing: '0.3px',
};

const pdfSectionStyle: React.CSSProperties = {
  padding: '20px 32px 4px',
  borderTop: `1px solid #e8d8b0`,
};

const pdfLinkTextStyle: React.CSSProperties = {
  margin: '0',
  fontSize: '14px',
};

const pdfLinkStyle: React.CSSProperties = {
  color: NAVY,
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'underline',
  letterSpacing: '0.2px',
};

const ctaSectionStyle: React.CSSProperties = {
  padding: '28px 32px 32px',
  textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: ORANGE,
  color: '#ffffff',
  padding: '14px 36px',
  borderRadius: '3px',
  fontSize: '15px',
  fontWeight: '700',
  display: 'inline-block',
  textDecoration: 'none',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
};

const hrStyle: React.CSSProperties = {
  margin: '0',
  borderColor: NAVY,
  borderWidth: '3px',
  borderStyle: 'solid',
};

const footerBandStyle: React.CSSProperties = {
  backgroundColor: NAVY,
  padding: '12px 32px',
  textAlign: 'center',
};

const footerTaglineStyle: React.CSSProperties = {
  color: YELLOW,
  fontSize: '12px',
  fontWeight: '800',
  letterSpacing: '2px',
  margin: '0',
};

const footerStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#7a6540',
  margin: '14px 32px 18px',
  textAlign: 'center',
  lineHeight: '1.5',
};

const footerLinkStyle: React.CSSProperties = {
  color: '#7a6540',
  textDecoration: 'underline',
};
