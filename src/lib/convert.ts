// Conversion and card-fee maths. All rates are MUR per 1 unit of foreign currency.
import type { Rate } from './rates';

export type RateType = 'cash' | 'card';
export type Rounding = 1 | 5 | 10;

export interface ConvertSettings {
  rateType: RateType;
  /** Foreign-transaction fee charged by the card issuer, in percent (2.75 = 2.75 %). */
  cardFeePct: number;
  rounding: Rounding;
}

export interface EffectiveRate {
  /** Rs per 1 foreign unit, fees included. */
  perUnit: number;
  /** The BoM column used before fees. */
  base: number;
  baseKind: 'sellNotes' | 'sellTT';
  feePct: number;
  /** Cash was asked for but no notes rate is published, so the transfer rate is used. */
  noCashRate: boolean;
}

export function effectiveRate(rate: Rate, s: ConvertSettings): EffectiveRate {
  if (s.rateType === 'cash') {
    if (rate.sellNotes !== undefined) {
      return { perUnit: rate.sellNotes, base: rate.sellNotes, baseKind: 'sellNotes', feePct: 0, noCashRate: false };
    }
    return { perUnit: rate.sellTT, base: rate.sellTT, baseKind: 'sellTT', feePct: 0, noCashRate: true };
  }
  const feePct = Math.max(0, s.cardFeePct);
  return { perUnit: rate.sellTT * (1 + feePct / 100), base: rate.sellTT, baseKind: 'sellTT', feePct, noCashRate: false };
}

/** Foreign amount -> Rs (unrounded). */
export function toMur(amount: number, rate: Rate, s: ConvertSettings): number {
  return amount * effectiveRate(rate, s).perUnit;
}

/** Rs -> foreign amount you'd get for it. */
export function fromMur(mur: number, rate: Rate, s: ConvertSettings): number {
  return mur / effectiveRate(rate, s).perUnit;
}

/**
 * Rounds a rupee amount for display. The chosen step only applies once it is under
 * ~5 % of the amount, so Rs 3 isn't shown as Rs 5. Amounts under Rs 1 keep cents.
 */
export function roundRs(value: number, step: Rounding): number {
  if (value < 1) return Math.round(value * 100) / 100;
  const s = value >= step * 10 ? step : 1;
  return Math.round(value / s) * s;
}
