// Shape of public/rates.json, shared by the pipeline and the app.
// Every rate is "MUR per 1 unit" of the foreign currency.

export type RateSource = 'bom' | 'market';

export interface Rate {
  /** Bank sells foreign cash to you: what you pay in Rs per note. */
  sellNotes?: number;
  /** Bank sells by transfer/draft: closest to what a card is charged before fees. */
  sellTT: number;
  /** Bank buys foreign currency from you by transfer. */
  buyTT: number;
  mid: number;
  source: RateSource;
  /** True when sell/buy were derived from a market mid plus a typical BoM spread. */
  estimated?: boolean;
}

export interface RatesFile {
  /** When the pipeline produced this file (ISO 8601). */
  updated: string;
  /** Publication date shown on the BoM page (YYYY-MM-DD). */
  bomDate: string;
  /** Date of the market rates used for non-BoM currencies (ISO 8601). */
  marketDate?: string;
  rates: Record<string, Rate>;
}
