import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BomParseError, normaliseCountry, parseBomConsolidated, BOM_COUNTRY_TO_ISO } from '../pipeline/bom';
import { buildRates, ratesChanged, validateRates, ValidationError } from '../pipeline/build';
import { parseMarket } from '../pipeline/market';
import { CURRENCIES } from '../src/lib/currencies';

const html = readFileSync(new URL('./fixtures/bom-consolidated-2026-11-24.html', import.meta.url), 'utf8');
const marketJson = JSON.parse(readFileSync(new URL('./fixtures/er-api-usd-2026-11-24.json', import.meta.url), 'utf8'));

describe('BoM consolidated page parser', () => {
  const bom = parseBomConsolidated(html);
  const by = Object.fromEntries(bom.rows.map((r) => [r.code, r]));

  it('reads the publication date', () => {
    expect(bom.date).toBe('2026-11-24');
  });

  it('parses all 12 currencies with ISO codes', () => {
    expect(bom.rows.map((r) => r.code).sort()).toEqual(
      ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'INR', 'JPY', 'NZD', 'SGD', 'USD', 'ZAR'],
    );
  });

  it('reads every column for a row', () => {
    expect(by.EUR).toMatchObject({ unit: 1, buyTT: 50.6043, buyDD: 50.4873, buyNotes: 50.3384, sellTT: 52.1201, sellNotes: 52.2022 });
  });

  it('normalises JPY from per-100 to per-1', () => {
    expect(by.JPY.unit).toBe(100);
    expect(by.JPY.sellTT).toBeCloseTo(0.300546, 6);
    expect(by.JPY.sellNotes).toBeCloseTo(0.300826, 6);
  });

  it('puts every currency inside its sanity range after normalisation', () => {
    for (const r of bom.rows) {
      const [lo, hi] = CURRENCIES[r.code].range;
      for (const v of [r.buyTT, r.sellTT, r.sellNotes]) {
        expect(v, r.code).toBeGreaterThanOrEqual(lo);
        expect(v, r.code).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('fails loudly on an unknown country', () => {
    expect(() => parseBomConsolidated(html.replace(/\bSWITZERLAND\b/g, 'ATLANTIS'))).toThrow(/Unknown BoM country "ATLANTIS"/);
  });

  it('fails when the code column disagrees with the mapping', () => {
    expect(() => parseBomConsolidated(html.replaceAll('USD 1', 'USX 1'))).toThrow(BomParseError);
  });

  it('fails when the table structure changes', () => {
    expect(() => parseBomConsolidated(html.replaceAll('T.T/D.D', 'Selling TT'))).toThrow(/page structure changed/);
    expect(() => parseBomConsolidated('<html><body>Maintenance</body></html>')).toThrow(BomParseError);
  });

  it('treats blank cells as missing, not zero', () => {
    const blanked = html.replace(/33\.1512/g, '');
    const aud = parseBomConsolidated(blanked).rows.find((r) => r.code === 'AUD')!;
    expect(aud.sellNotes).toBeUndefined();
    expect(aud.sellTT).toBe(32.9891);
  });
});

describe('country mapping', () => {
  it('normalises BoM labels', () => {
    expect(normaliseCountry('U.K.')).toBe('U.K');
    expect(normaliseCountry('U.S.A.')).toBe('U.S.A');
    expect(normaliseCountry(' emu*** ')).toBe('EMU');
    expect(normaliseCountry('U.A.  EMIRATES')).toBe('U.A. EMIRATES');
  });

  it('maps the examples from the brief', () => {
    const m = (s: string) => BOM_COUNTRY_TO_ISO[normaliseCountry(s)];
    expect([m('EMU'), m('U.K'), m('U.S.A'), m('U.A. EMIRATES'), m('SOUTH AFRICA'), m('INDIA'), m('JAPAN'), m('CHINA')])
      .toEqual(['EUR', 'GBP', 'USD', 'AED', 'ZAR', 'INR', 'JPY', 'CNY']);
  });

  it('uses unique ISO codes', () => {
    const codes = Object.values(BOM_COUNTRY_TO_ISO);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('rates.json build + validation', () => {
  const bom = parseBomConsolidated(html);
  const market = parseMarket(marketJson);
  const now = new Date('2026-11-24T06:00:00Z');
  const file = buildRates(bom, market, now);

  it('converts market rates to MUR per unit', () => {
    expect(market.mid.USD).toBeCloseTo(46.868, 2);
    expect(market.mid.THB).toBeGreaterThan(1);
  });

  it('prefers BoM and marks sources', () => {
    expect(file.rates.EUR.source).toBe('bom');
    expect(file.rates.EUR.sellNotes).toBe(52.2022);
    expect(file.rates.THB.source).toBe('market');
    expect(file.rates.THB.estimated).toBe(true);
    expect(file.rates.THB.sellTT).toBeGreaterThan(file.rates.THB.mid);
    expect(file.bomDate).toBe('2026-11-24');
    expect(file.updated).toBe('2026-11-24T06:00:00.000Z');
  });

  it('covers every currency the app lists', () => {
    expect(Object.keys(file.rates).sort()).toEqual(Object.keys(CURRENCIES).sort());
  });

  it('passes validation against itself', () => {
    expect(() => validateRates(file, file)).not.toThrow();
  });

  it('rejects fewer than 10 currencies', () => {
    const small = buildRates({ ...bom, rows: bom.rows.slice(0, 5) }, undefined, now);
    expect(() => validateRates(small)).toThrow(ValidationError);
  });

  it('rejects a >10 % daily move', () => {
    const prev = structuredClone(file);
    prev.rates.USD.mid = file.rates.USD.mid * 0.85;
    expect(() => validateRates(file, prev)).toThrow(/USD moved/);
  });

  it('rejects a unit mistake via the sanity range', () => {
    const bad = structuredClone(file);
    bad.rates.JPY = { ...bad.rates.JPY, sellTT: 30.0546, buyTT: 29.18, mid: 29.6 };
    expect(() => validateRates(bad)).toThrow(/JPY.*sanity range/);
  });

  it('only reports a change when rates change', () => {
    const later = buildRates(bom, market, new Date('2026-11-25T06:00:00Z'));
    expect(ratesChanged(later, file)).toBe(false);
    const moved = structuredClone(later);
    moved.rates.EUR.sellTT += 0.01;
    expect(ratesChanged(moved, file)).toBe(true);
  });
});
