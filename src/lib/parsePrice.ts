// Finds prices in a line of (OCR'd) text.
//
// Handles symbols and codes before or after the number ("€ 9.99", "9,99 €", "USD 12",
// "1,280円"), both decimal conventions ("1.234,50" and "1,234.50"), Swiss apostrophes
// ("1'234.50"), spaces as thousand separators next to a currency ("1 234,50 €"), and
// the dash notation ("12,-", "CHF 12.–").
import { CURRENCIES } from './currencies';

export interface PriceMatch {
  value: number;
  /** Resolved ISO code. */
  currency: string;
  /** True when a currency marker was found next to the number. */
  explicit: boolean;
  /** The matched text, including any marker. */
  raw: string;
  index: number;
  length: number;
}

export interface ParseOptions {
  /** The traveller's current currency, used for bare numbers and ambiguous symbols. */
  trip: string;
}

/** Marker text -> candidate currencies, most likely first. */
const MARKERS: Record<string, string[]> = {
  'US$': ['USD'], 'A$': ['AUD'], 'AU$': ['AUD'], 'C$': ['CAD'], 'CA$': ['CAD'], 'NZ$': ['NZD'],
  'S$': ['SGD'], 'SG$': ['SGD'], 'HK$': ['HKD'], 'NT$': ['TWD'], 'R$': ['BRL'], 'MX$': ['MXN'],
  $: ['USD', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD', 'TWD', 'MXN'],
  '€': ['EUR'], '£': ['GBP', 'EGP'], 'E£': ['EGP'], LE: ['EGP'],
  '¥': ['JPY', 'CNY'], '円': ['JPY'], '元': ['CNY'], RMB: ['CNY'],
  '฿': ['THB'], '₹': ['INR'], '₩': ['KRW'], '원': ['KRW'], '₺': ['TRY'], TL: ['TRY'],
  '₱': ['PHP'], '₫': ['VND'], 'đ': ['VND'], '₪': ['ILS'],
  'zł': ['PLN'], 'Kč': ['CZK'], Ft: ['HUF'],
  kr: ['SEK', 'NOK', 'DKK'], Kr: ['SEK', 'NOK', 'DKK'], 'kr.': ['DKK', 'SEK', 'NOK'],
  Rp: ['IDR'], RM: ['MYR'], R: ['ZAR'],
  Rs: ['INR', 'LKR', 'PKR', 'NPR', 'SCR'], 'Rs.': ['INR', 'LKR', 'PKR', 'NPR', 'SCR'],
  Dhs: ['AED'], 'Dhs.': ['AED'], Dh: ['AED', 'MAD'], DH: ['MAD', 'AED'],
  SR: ['SAR', 'SCR'], QR: ['QAR'], RO: ['OMR'], BD: ['BHD'], KD: ['KWD'],
  Fr: ['CHF'], 'Fr.': ['CHF'], SFr: ['CHF'],
  Ar: ['MGA'], KSh: ['KES'], Ksh: ['KES'], TSh: ['TZS'], Rf: ['MVR'], MRf: ['MVR'],
  Tk: ['BDT'], '৳': ['BDT'],
};
for (const code of Object.keys(CURRENCIES)) MARKERS[code] = [code];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const markerAlt = Object.keys(MARKERS)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|');
// A marker must not be glued to other letters ("BAR 12" is not "R 12").
const MARK = `(?<![\\p{L}])(?:${markerAlt})(?![\\p{L}])`;
const SEP = `[.,'’\\u00A0\\u202F ]`;
const NUM = `\\d{1,3}(?:${SEP}\\d{3})+(?:[.,]\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?`;
const DASH = `[.,][-–—]{1,2}`;

const PRICE_RE = new RegExp(
  `(?<pre>${MARK})?[ \\u00A0]?(?<!\\d[.,'’]?)(?<num>${NUM})(?![\\d])(?<dash>${DASH})?(?:[ \\u00A0]?(?<post>${MARK}))?`,
  'gu',
);

// Bare numbers followed by these are measurements, times, dates, not prices.
const NOT_PRICE_AFTER = /^\s?(?:%|‰|°|[:/]\d|h\d|x\b|kg\b|g\b|gr\b|mg\b|ml\b|cl\b|l\b|L\b|cm\b|mm\b|km\b|m\b|pcs\b|pc\b)/u;
const NOT_PRICE_BEFORE = /(?:[:/#№]|\bNo\.?|\bx)\s?$/u;

/** Interprets the digits/separators of a number. `decimals` breaks "1.250" ties. */
export function parseNumber(raw: string, decimals = 2): number | undefined {
  const s = raw.replace(/[\s  '’]/g, '');
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let normalised: string;
  if (dots && commas) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    normalised = s.split(thou).join('').replace(dec, '.');
  } else if (dots + commas === 0) {
    normalised = s;
  } else {
    const sep = dots ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2) normalised = parts.join('');
    else if (parts[1].length === 3 && decimals !== 3) normalised = parts.join('');
    else normalised = `${parts[0]}.${parts[1]}`;
  }
  if (!/^\d+(\.\d+)?$/.test(normalised)) return undefined;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : undefined;
}

function resolve(candidates: string[] | undefined, trip: string): string {
  if (!candidates?.length) return trip;
  return candidates.includes(trip) ? trip : candidates[0];
}

export function findPrices(line: string, { trip }: ParseOptions): PriceMatch[] {
  const out: PriceMatch[] = [];
  for (const m of line.matchAll(PRICE_RE)) {
    const g = m.groups!;
    let numText = g.num;
    let index = m.index!;
    let raw = m[0].trimEnd();
    const pre = g.pre ? MARKERS[g.pre] : undefined;
    const post = g.post ? MARKERS[g.post] : undefined;
    const explicit = Boolean(pre || post);

    // Without a marker, "2 100" is a quantity and a price, not 2100: keep the last group.
    if (!explicit && /[   ]/.test(numText)) {
      const lastSpace = Math.max(numText.lastIndexOf(' '), numText.lastIndexOf(' '), numText.lastIndexOf(' '));
      index += lastSpace + 1;
      numText = numText.slice(lastSpace + 1);
      raw = numText + (g.dash ?? '');
    }

    const candidates = pre && post ? pre.filter((c) => post.includes(c)) : pre ?? post;
    const currency = resolve(candidates?.length ? candidates : pre ?? post, trip);
    const decimals = CURRENCIES[currency]?.decimals ?? 2;
    const value = parseNumber(numText, decimals);
    if (value === undefined || value <= 0) continue;

    if (!explicit) {
      const before = line.slice(0, index);
      const after = line.slice(index + raw.length);
      if (NOT_PRICE_BEFORE.test(before) || NOT_PRICE_AFTER.test(after)) continue;
      const hasCents = /[.,]\d{2}$/.test(numText);
      const atLineEnd = /^[\s.:\-–—*]*$/u.test(after) && /^\d{1,7}$/.test(numText.replace(/[.,'’]/g, ''));
      const looksLikeYear = /^(19|20)\d{2}$/.test(numText) && (CURRENCIES[trip]?.decimals ?? 2) > 0;
      if (!(hasCents || g.dash || atLineEnd) || looksLikeYear) continue;
    }

    out.push({ value, currency, explicit, raw, index, length: raw.length });
  }
  return out;
}
