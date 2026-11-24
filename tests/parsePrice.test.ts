import { describe, expect, it } from 'vitest';
import { findPrices, parseNumber } from '../src/lib/parsePrice';

const one = (text: string, trip = 'EUR') => {
  const found = findPrices(text, { trip });
  return found.length === 1 ? { value: found[0].value, currency: found[0].currency } : found;
};

describe('parseNumber', () => {
  it.each([
    ['1.234,50', 1234.5],
    ['1,234.50', 1234.5],
    ['1 234,50', 1234.5],
    ["1'234.50", 1234.5],
    ['1,234', 1234],
    ['1.234', 1234],
    ['12,5', 12.5],
    ['12.99', 12.99],
    ['1.234.567', 1234567],
    ['1,234,567.89', 1234567.89],
    ['0,99', 0.99],
    ['120', 120],
  ])('%s -> %d', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it('treats a 3-digit group as decimals for 3-decimal currencies', () => {
    expect(parseNumber('1.250', 3)).toBe(1.25);
    expect(parseNumber('1.250', 2)).toBe(1250);
  });
});

describe('findPrices – real-world formats', () => {
  it.each<[string, string, number, string]>([
    // [text, trip currency, value, currency]
    ['€ 9.99', 'EUR', 9.99, 'EUR'],
    ['€9,99', 'EUR', 9.99, 'EUR'],
    ['9,99 €', 'EUR', 9.99, 'EUR'],
    ['12,50€', 'EUR', 12.5, 'EUR'],
    ['€1.234,50', 'EUR', 1234.5, 'EUR'],
    ['1 234,50 €', 'EUR', 1234.5, 'EUR'],
    ['Prix 12,-', 'EUR', 12, 'EUR'],
    ['$12.99', 'USD', 12.99, 'USD'],
    ['12.99$', 'USD', 12.99, 'USD'],
    ['US$ 1,234.50', 'EUR', 1234.5, 'USD'],
    ['USD 12', 'EUR', 12, 'USD'],
    ['12 USD', 'EUR', 12, 'USD'],
    ['£4.50', 'EUR', 4.5, 'GBP'],
    ['¥1,280', 'JPY', 1280, 'JPY'],
    ['1,280円', 'EUR', 1280, 'JPY'],
    ['฿120', 'THB', 120, 'THB'],
    ['120 ฿', 'EUR', 120, 'THB'],
    ['₹ 450', 'EUR', 450, 'INR'],
    ['Rs. 450', 'INR', 450, 'INR'],
    ['Rs 450', 'LKR', 450, 'LKR'],
    ['AED 25.00', 'EUR', 25, 'AED'],
    ['25 AED', 'EUR', 25, 'AED'],
    ['Dhs 25', 'EUR', 25, 'AED'],
    ['Rp 25.000', 'IDR', 25000, 'IDR'],
    ['Rp25.000,-', 'IDR', 25000, 'IDR'],
    ['RM 12.90', 'EUR', 12.9, 'MYR'],
    ['₩12,000', 'EUR', 12000, 'KRW'],
    ['12.000 ₫', 'EUR', 12000, 'VND'],
    ['CHF 12.–', 'EUR', 12, 'CHF'],
    ['Fr. 4.20', 'CHF', 4.2, 'CHF'],
    ['kr 49,90', 'SEK', 49.9, 'SEK'],
    ['49,90 kr', 'NOK', 49.9, 'NOK'],
    ['R 85,00', 'EUR', 85, 'ZAR'],
    ['R$ 39,90', 'EUR', 39.9, 'BRL'],
    ['KD 1.250', 'KWD', 1.25, 'KWD'],
    ['A$15', 'EUR', 15, 'AUD'],
    ['S$ 8.50', 'EUR', 8.5, 'SGD'],
    ['HK$ 68', 'EUR', 68, 'HKD'],
    ['TL 45,00', 'EUR', 45, 'TRY'],
    ['₺45', 'EUR', 45, 'TRY'],
    ['zł 19,99', 'EUR', 19.99, 'PLN'],
    ['399 Kč', 'EUR', 399, 'CZK'],
  ])('%s (trip %s)', (text, trip, value, currency) => {
    expect(one(text, trip)).toEqual({ value, currency });
  });

  it('uses the trip currency for an ambiguous $', () => {
    expect(one('$12.99', 'AUD')).toEqual({ value: 12.99, currency: 'AUD' });
    expect(one('$12.99', 'SGD')).toEqual({ value: 12.99, currency: 'SGD' });
    expect(one('$12.99', 'THB')).toEqual({ value: 12.99, currency: 'USD' });
  });

  it('uses the trip currency for ¥ in China', () => {
    expect(one('¥35', 'CNY')).toEqual({ value: 35, currency: 'CNY' });
  });

  it('reads bare menu prices at the end of a line', () => {
    expect(one('Pad Thai 120', 'THB')).toEqual({ value: 120, currency: 'THB' });
    expect(one('Croissant ....... 2.40', 'EUR')).toEqual({ value: 2.4, currency: 'EUR' });
    expect(one('Nasi goreng 35.000', 'IDR')).toEqual({ value: 35000, currency: 'IDR' });
  });

  it('reads bare numbers with cents anywhere', () => {
    expect(one('SALE 19.99 only today', 'USD')).toEqual({ value: 19.99, currency: 'USD' });
  });

  it('finds several prices on one line', () => {
    const found = findPrices('Small €3.50  Large €4.20', { trip: 'EUR' });
    expect(found.map((f) => f.value)).toEqual([3.5, 4.2]);
  });

  it('reports positions of the matched text', () => {
    const [m] = findPrices('Coffee € 2.80 to go', { trip: 'EUR' });
    expect(m.raw).toBe('€ 2.80');
    expect(m.index).toBe(7);
    expect(m.explicit).toBe(true);
  });

  it.each([
    ['Open 10:30', 'EUR'],
    ['500g', 'EUR'],
    ['15%', 'EUR'],
    ['Since 1998', 'EUR'],
    ['Table 12 seats 4 people', 'EUR'],
    ['Tel 230 5555 1234 call', 'EUR'],
    ['24/7', 'EUR'],
    ['Room #204', 'EUR'],
    ['1.5 L', 'EUR'],
    ['0', 'EUR'],
  ])('ignores non-prices: %s', (text, trip) => {
    expect(findPrices(text, { trip })).toEqual([]);
  });

  it('does not merge a quantity and a bare price', () => {
    expect(one('2 100', 'THB')).toEqual({ value: 100, currency: 'THB' });
  });

  it('does not match a marker glued to a word', () => {
    expect(findPrices('BAR 12 STOOLS', { trip: 'EUR' })).toEqual([]);
  });
});

describe('pricesInLine (OCR words -> located prices)', () => {
  const w = (text: string, x0: number, confidence = 90) => ({ text, confidence, bbox: { x0, y0: 10, x1: x0 + 10 * text.length, y1: 30 } });

  it('merges the boxes of a marker and number split into two words', async () => {
    const { pricesInLine } = await import('../src/lib/ocrPrices');
    const [p] = pricesInLine([w('Coffee', 0), w('€', 80), w('2.80', 100)], 'EUR');
    expect(p.value).toBe(2.8);
    expect(p.bbox).toEqual({ x0: 80, y0: 10, x1: 140, y1: 30 });
  });

  it('drops low-confidence reads', async () => {
    const { pricesInLine } = await import('../src/lib/ocrPrices');
    expect(pricesInLine([w('€', 0), w('2.80', 20, 30)], 'EUR')).toEqual([]);
  });
});
