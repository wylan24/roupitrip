// Merges BoM and market rates into rates.json and validates the result.
import { CURRENCIES } from '../src/lib/currencies';
import type { Rate, RatesFile } from '../src/lib/rates';
import type { BomResult } from './bom';
import type { MarketResult } from './market';

export const MIN_CURRENCIES = 10;
export const MIN_BOM_CURRENCIES = 10;
export const MAX_DAILY_MOVE = 0.1;

export class ValidationError extends Error {}

const round = (n: number) => Number(n.toPrecision(6));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildRates(bom: BomResult, market: MarketResult | undefined, now = new Date()): RatesFile {
  const rates: Record<string, Rate> = {};
  const ttSpreads: number[] = [];
  const notesSpreads: number[] = [];

  for (const row of bom.rows) {
    if (!CURRENCIES[row.code]) continue; // BoM publishes it, but the app doesn't list it yet
    if (row.sellTT === undefined || row.buyTT === undefined) {
      throw new ValidationError(`${row.code}: missing T.T rates`);
    }
    const mid = (row.buyTT + row.sellTT) / 2;
    rates[row.code] = {
      sellNotes: row.sellNotes === undefined ? undefined : round(row.sellNotes),
      sellTT: round(row.sellTT),
      buyTT: round(row.buyTT),
      mid: round(mid),
      source: 'bom',
    };
    ttSpreads.push(row.sellTT / mid - 1);
    if (row.sellNotes !== undefined) notesSpreads.push(row.sellNotes / mid - 1);
  }

  // For market currencies, apply the typical BoM bank spread so "what you pay"
  // is comparable with BoM currencies rather than an optimistic mid-market rate.
  const ttSpread = ttSpreads.length ? median(ttSpreads) : 0.015;
  const notesSpread = notesSpreads.length ? median(notesSpreads) : 0.02;
  if (market) {
    for (const code of Object.keys(CURRENCIES)) {
      if (rates[code]) continue;
      const mid = market.mid[code];
      if (!mid) continue;
      rates[code] = {
        sellNotes: round(mid * (1 + notesSpread)),
        sellTT: round(mid * (1 + ttSpread)),
        buyTT: round(mid * (1 - ttSpread)),
        mid: round(mid),
        source: 'market',
        estimated: true,
      };
    }
  }

  const sorted = Object.fromEntries(Object.entries(rates).sort(([a], [b]) => a.localeCompare(b)));
  for (const r of Object.values(sorted)) if (r.sellNotes === undefined) delete r.sellNotes;

  return {
    updated: now.toISOString(),
    bomDate: bom.date,
    ...(market ? { marketDate: market.date } : {}),
    rates: sorted,
  };
}

/** Throws ValidationError describing every problem found. */
export function validateRates(next: RatesFile, previous?: RatesFile): void {
  const problems: string[] = [];
  const codes = Object.keys(next.rates);
  const bomCount = codes.filter((c) => next.rates[c].source === 'bom').length;

  if (codes.length < MIN_CURRENCIES) problems.push(`Only ${codes.length} currencies (need ${MIN_CURRENCIES})`);
  if (bomCount < MIN_BOM_CURRENCIES) problems.push(`Only ${bomCount} BoM currencies (need ${MIN_BOM_CURRENCIES})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.bomDate)) problems.push(`Bad bomDate "${next.bomDate}"`);

  for (const [code, r] of Object.entries(next.rates)) {
    const [lo, hi] = CURRENCIES[code].range;
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'number') continue;
      if (!Number.isFinite(v) || v <= 0) problems.push(`${code}.${k} is not a positive number`);
      else if (v < lo * 0.97 || v > hi * 1.03) {
        problems.push(`${code}.${k} = ${v} is outside the sanity range ${lo}–${hi} MUR (wrong unit?)`);
      }
    }
    if (r.sellTT < r.buyTT) problems.push(`${code}: sell ${r.sellTT} is below buy ${r.buyTT}`);

    const prev = previous?.rates[code];
    if (prev) {
      const move = Math.abs(r.mid / prev.mid - 1);
      if (move > MAX_DAILY_MOVE) {
        problems.push(`${code} moved ${(move * 100).toFixed(1)} % since the last file (${prev.mid} -> ${r.mid})`);
      }
    }
  }

  if (previous && next.bomDate < previous.bomDate) {
    problems.push(`bomDate ${next.bomDate} is older than the published ${previous.bomDate}`);
  }

  if (problems.length) throw new ValidationError(`rates.json rejected:\n - ${problems.join('\n - ')}`);
}

/** True when the parts users see changed (ignores the "updated" timestamp). */
export function ratesChanged(next: RatesFile, previous?: RatesFile): boolean {
  if (!previous) return true;
  const strip = ({ updated: _u, ...rest }: RatesFile) => JSON.stringify(rest);
  return strip(next) !== strip(previous);
}
