import { formatNumber, getLang } from '../i18n';
import { roundRs, type Rounding } from '../lib/convert';
import { CURRENCIES } from '../lib/currencies';

/** "Rs 1,234" using the user's rounding. */
export function formatRs(value: number, rounding: Rounding): string {
  const r = roundRs(value, rounding);
  const cents = r > 0 && r < 1 ? 2 : 0;
  return `Rs ${formatNumber(r, cents, cents)}`;
}

/** "Rs 52.1201": rates keep their precision. */
export function formatRate(value: number): string {
  return `Rs ${formatNumber(value, value < 1 ? 6 : 4, 2)}`;
}

/** "€12.50", "฿120", "AED 25.00". */
export function formatForeign(amount: number, code: string): string {
  const decimals = CURRENCIES[code]?.decimals ?? 2;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(getLang() === 'fr' ? 'fr-MU' : 'en-MU', {
      style: 'currency',
      currency: code,
      // "$" alone is ambiguous (AUD, SGD...): let Intl say "A$", "US$" for dollars.
      currencyDisplay: CURRENCIES[code]?.symbol.includes('$') ? 'symbol' : 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : Math.min(decimals, 2),
      maximumFractionDigits: Math.max(decimals, 2),
    }).format(amount);
  } catch {
    return `${code} ${formatNumber(amount, decimals)}`;
  }
}
