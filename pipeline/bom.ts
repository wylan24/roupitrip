// Parser for the Bank of Mauritius "Consolidated Indicative Exchange Rates" page:
// https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates
//
// The page has one main table (repeated once in a printable copy) with columns:
//   Country | Code | Buying T.T | Buying D.D | Buying Notes | Selling T.T/D.D | Selling Notes | Date
// "Code" cells carry the quotation unit, e.g. "USD 1" or "JPY 100".
import * as cheerio from 'cheerio';

export const BOM_URL = 'https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates';

/**
 * Explicit BoM country label -> ISO 4217. Labels are normalised (upper case,
 * trailing dots and asterisks removed) before lookup, so "U.K." and "U.K" both work.
 * Includes every country in BoM's per-bank list so new consolidated rows map cleanly.
 */
export const BOM_COUNTRY_TO_ISO: Record<string, string> = {
  AUSTRALIA: 'AUD',
  BAHRAIN: 'BHD',
  BANGLADESH: 'BDT',
  BOTSWANA: 'BWP',
  BRAZIL: 'BRL',
  CANADA: 'CAD',
  'CENTRAL AFRICA': 'XAF',
  CHINA: 'CNY',
  'COMOROS ISLAND': 'KMF',
  'DEM. REP OF CONGO': 'CDF',
  DENMARK: 'DKK',
  EGYPT: 'EGP',
  EMU: 'EUR',
  GHANA: 'GHS',
  'HONG KONG': 'HKD',
  INDIA: 'INR',
  INDONESIA: 'IDR',
  ISRAEL: 'ILS',
  JAPAN: 'JPY',
  KENYA: 'KES',
  KOREA: 'KRW',
  KUWAIT: 'KWD',
  MALAGASY: 'MGA',
  MALAWI: 'MWK',
  MALAYSIA: 'MYR',
  MOROCCO: 'MAD',
  MOZAMBIQUE: 'MZN',
  MYANMAR: 'MMK',
  NAMIBIA: 'NAD',
  NEPAL: 'NPR',
  'NEW ZEALAND': 'NZD',
  NIGERIA: 'NGN',
  NORWAY: 'NOK',
  PAKISTAN: 'PKR',
  RWANDA: 'RWF',
  'SAUDI ARABIA': 'SAR',
  SEYCHELLES: 'SCR',
  SINGAPORE: 'SGD',
  'SOUTH AFRICA': 'ZAR',
  'SRI LANKA': 'LKR',
  SUDAN: 'SDG',
  SWAZILAND: 'SZL',
  SWEDEN: 'SEK',
  SWITZERLAND: 'CHF',
  TAIWAN: 'TWD',
  TANZANIA: 'TZS',
  THAILAND: 'THB',
  'U.A. EMIRATES': 'AED',
  'U.K': 'GBP',
  'U.S.A': 'USD',
  UGANDA: 'UGX',
  URUGUAY: 'UYU',
  'WEST AFRICA': 'XOF',
  ZAMBIA: 'ZMW',
  ZIMBABWE: 'ZWG',
};

export const EXPECTED_HEADERS = ['Country', 'Code', 'T.T', 'D.D', 'Notes', 'T.T/D.D', 'Notes', 'Date'];

export interface BomRow {
  code: string;
  /** Units the row is quoted in (1, 100 ...). Already divided out of the rates below. */
  unit: number;
  buyTT?: number;
  buyDD?: number;
  buyNotes?: number;
  sellTT?: number;
  sellNotes?: number;
  date: string;
}

export interface BomResult {
  date: string;
  rows: BomRow[];
}

export class BomParseError extends Error {}

export function normaliseCountry(label: string): string {
  return label.toUpperCase().replace(/[*]+/g, '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
}

function cellNumber(text: string): number | undefined {
  const t = text.trim();
  if (t === '' || t === '-') return undefined;
  if (!/^\d+(\.\d+)?$/.test(t)) throw new BomParseError(`Unexpected rate cell "${t}"`);
  return Number(t);
}

/** "24-11-2026" -> "2026-11-24" */
function isoDate(text: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
  if (!m) throw new BomParseError(`Unexpected date "${text}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseBomConsolidated(html: string): BomResult {
  const $ = cheerio.load(html);

  // The rates table is the first one whose header row matches the expected columns.
  const table = $('table')
    .toArray()
    .find((t) => {
      const ths = $(t).find('th').toArray().map((th) => $(th).text().trim());
      return ths.includes('Country') && ths.includes('T.T/D.D');
    });
  if (!table) throw new BomParseError('Rates table not found: page structure changed');

  const headers = $(table)
    .find('th')
    .toArray()
    .map((th) => $(th).text().trim())
    .filter((h) => h && h !== 'Buying' && h !== 'Selling')
    .map((h) => (h === 'Curr Code' ? 'Code' : h));
  if (headers.join('|') !== EXPECTED_HEADERS.join('|')) {
    throw new BomParseError(`Header mismatch: got [${headers.join(', ')}], expected [${EXPECTED_HEADERS.join(', ')}]`);
  }

  const rows: BomRow[] = [];
  for (const tr of $(table).find('tbody tr').toArray()) {
    const cells = $(tr).find('td').toArray().map((td) => $(td).text().replace(/\s+/g, ' ').trim());
    if (cells.length === 0) continue;
    if (cells.length !== 8) throw new BomParseError(`Row has ${cells.length} cells: ${cells.join(' | ')}`);
    const [country, codeCell, buyTT, buyDD, buyNotes, sellTT, sellNotes, date] = cells;

    const iso = BOM_COUNTRY_TO_ISO[normaliseCountry(country)];
    if (!iso) throw new BomParseError(`Unknown BoM country "${country}": add it to BOM_COUNTRY_TO_ISO`);

    const m = /^([A-Z]{3})\s+(\d+)$/.exec(codeCell);
    if (!m) throw new BomParseError(`Unexpected code cell "${codeCell}" for ${country}`);
    if (m[1] !== iso) throw new BomParseError(`${country} maps to ${iso} but the page says ${m[1]}`);
    const unit = Number(m[2]);
    if (![1, 10, 100, 1000].includes(unit)) throw new BomParseError(`Unexpected unit ${unit} for ${iso}`);

    const per = (v: string) => {
      const n = cellNumber(v);
      return n === undefined ? undefined : n / unit;
    };
    rows.push({
      code: iso,
      unit,
      buyTT: per(buyTT),
      buyDD: per(buyDD),
      buyNotes: per(buyNotes),
      sellTT: per(sellTT),
      sellNotes: per(sellNotes),
      date: isoDate(date),
    });
  }

  if (rows.length === 0) throw new BomParseError('Rates table is empty');
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return { date: dates[dates.length - 1], rows };
}
