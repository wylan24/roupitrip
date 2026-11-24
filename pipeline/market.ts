// Market-rate fallback for currencies BoM doesn't publish.
// Source: ExchangeRate-API open access endpoint (free, no key, updated daily).
// Terms: https://www.exchangerate-api.com/terms - attribution link required,
// which the app shows on the Info screen.
export const MARKET_URL = 'https://open.er-api.com/v6/latest/USD';

export interface MarketResult {
  date: string;
  /** MUR per 1 unit, mid-market. */
  mid: Record<string, number>;
}

interface ErApiResponse {
  result: string;
  base_code: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
}

export function parseMarket(json: unknown): MarketResult {
  const d = json as ErApiResponse;
  if (d?.result !== 'success' || d.base_code !== 'USD' || typeof d.rates !== 'object') {
    throw new Error('Market rates response has an unexpected shape');
  }
  const mur = d.rates.MUR;
  if (!(mur > 0)) throw new Error('Market rates response has no MUR rate');
  const mid: Record<string, number> = {};
  for (const [code, perUsd] of Object.entries(d.rates)) {
    if (perUsd > 0 && code !== 'MUR') mid[code] = mur / perUsd;
  }
  return { date: new Date(d.time_last_update_unix * 1000).toISOString(), mid };
}
