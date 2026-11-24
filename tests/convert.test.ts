import { describe, expect, it } from 'vitest';
import { effectiveRate, fromMur, roundRs, toMur, type ConvertSettings } from '../src/lib/convert';
import { suggestCurrency } from '../src/lib/locale';
import type { Rate } from '../src/lib/rates';

const EUR: Rate = { sellNotes: 52.2022, sellTT: 52.1201, buyTT: 50.6043, mid: 51.3622, source: 'bom' };
const CNY: Rate = { sellTT: 7.605, buyTT: 7.0274, mid: 7.3162, source: 'bom' };
const cash: ConvertSettings = { rateType: 'cash', cardFeePct: 2.75, rounding: 1 };
const card: ConvertSettings = { rateType: 'card', cardFeePct: 2.75, rounding: 1 };

describe('conversion', () => {
  it('uses SELL_NOTES for cash', () => {
    expect(toMur(10, EUR, cash)).toBeCloseTo(522.022, 6);
    expect(effectiveRate(EUR, cash)).toMatchObject({ baseKind: 'sellNotes', feePct: 0, noCashRate: false });
  });

  it('uses SELL_TT plus the card fee for card', () => {
    // 52.1201 * 1.0275 = 53.5534...
    expect(effectiveRate(EUR, card).perUnit).toBeCloseTo(53.55340275, 8);
    expect(toMur(100, EUR, card)).toBeCloseTo(5355.340275, 6);
  });

  it('applies a custom card fee and never a negative one', () => {
    expect(effectiveRate(EUR, { ...card, cardFeePct: 0 }).perUnit).toBe(52.1201);
    expect(effectiveRate(EUR, { ...card, cardFeePct: -5 }).perUnit).toBe(52.1201);
    expect(effectiveRate(EUR, { ...card, cardFeePct: 2 }).perUnit).toBeCloseTo(53.162502, 6);
  });

  it('falls back to SELL_TT when no cash rate is published', () => {
    const r = effectiveRate(CNY, cash);
    expect(r).toMatchObject({ perUnit: 7.605, baseKind: 'sellTT', noCashRate: true });
  });

  it('round-trips MUR -> foreign -> MUR', () => {
    for (const s of [cash, card]) {
      expect(toMur(fromMur(1000, EUR, s), EUR, s)).toBeCloseTo(1000, 9);
    }
  });

  it('converts MUR to foreign with the same rate', () => {
    expect(fromMur(522.022, EUR, cash)).toBeCloseTo(10, 9);
  });
});

describe('roundRs', () => {
  it.each([
    [611.6, 1, 612],
    [611.6, 5, 610],
    [613, 5, 615],
    [616, 10, 620],
    [3.4, 5, 3],
    [47, 10, 47],
    [52, 5, 50],
    [0.554, 10, 0.55],
    [1234.5, 1, 1235],
  ])('%d to step %d -> %d', (value, step, expected) => {
    expect(roundRs(value, step as 1 | 5 | 10)).toBe(expected);
  });
});

describe('suggestCurrency', () => {
  it.each([
    ['Europe/Paris', 'EUR'],
    ['Asia/Dubai', 'AED'],
    ['Asia/Bangkok', 'THB'],
    ['Asia/Makassar', 'IDR'],
    ['Australia/Perth', 'AUD'],
    ['Indian/Reunion', 'EUR'],
    ['Asia/Kolkata', 'INR'],
  ])('%s -> %s', (tz, code) => {
    expect(suggestCurrency(tz)).toBe(code);
  });

  it('suggests nothing at home or for unknown zones', () => {
    expect(suggestCurrency('Indian/Mauritius')).toBeUndefined();
    expect(suggestCurrency('Antarctica/Troll')).toBeUndefined();
  });
});
