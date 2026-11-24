// Shared currency metadata, used by both the rates pipeline (scripts/) and the app.

export interface CurrencyInfo {
  code: string;
  /** Short symbol used when displaying an amount, e.g. "€". */
  symbol: string;
  /** Usual number of decimals shown on price tags. */
  decimals: number;
  /** Plausible MUR-per-1-unit range. Anything outside fails the pipeline. */
  range: [number, number];
}

const c = (code: string, symbol: string, decimals: number, range: [number, number]): CurrencyInfo => ({
  code,
  symbol,
  decimals,
  range,
});

/**
 * Currencies the app supports. Ranges are deliberately wide (roughly ±40 % around
 * late-2026 levels): they exist to catch unit mistakes (per 100 vs per 1), not to
 * police normal market moves. Widen a range if a currency genuinely drifts out.
 */
export const CURRENCIES: Record<string, CurrencyInfo> = Object.fromEntries(
  [
    // Covered by the Bank of Mauritius consolidated indicative rates
    c('USD', '$', 2, [30, 75]),
    c('EUR', '€', 2, [35, 80]),
    c('GBP', '£', 2, [40, 95]),
    c('JPY', '¥', 0, [0.18, 0.5]),
    c('AUD', 'A$', 2, [20, 48]),
    c('CAD', 'C$', 2, [22, 50]),
    c('NZD', 'NZ$', 2, [16, 42]),
    c('SGD', 'S$', 2, [24, 55]),
    c('CHF', 'CHF', 2, [35, 85]),
    c('CNY', '¥', 2, [4.5, 11]),
    c('INR', '₹', 2, [0.3, 0.8]),
    c('ZAR', 'R', 2, [1.6, 4.2]),
    // Market-rate fallback
    c('AED', 'AED', 2, [8, 20]),
    c('SAR', 'SAR', 2, [8, 19.5]),
    c('QAR', 'QAR', 2, [8, 20]),
    c('OMR', 'OMR', 3, [80, 190]),
    c('BHD', 'BHD', 3, [80, 195]),
    c('KWD', 'KWD', 3, [100, 240]),
    c('THB', '฿', 2, [0.9, 2.2]),
    c('MYR', 'RM', 2, [7, 17]),
    c('IDR', 'Rp', 0, [0.0018, 0.0045]),
    c('KRW', '₩', 0, [0.022, 0.055]),
    c('HKD', 'HK$', 2, [4, 9.5]),
    c('TWD', 'NT$', 0, [0.95, 2.3]),
    c('VND', '₫', 0, [0.0011, 0.003]),
    c('PHP', '₱', 2, [0.5, 1.25]),
    c('TRY', '₺', 2, [0.3, 2.5]),
    c('SEK', 'kr', 2, [2.8, 7]),
    c('NOK', 'kr', 2, [2.7, 6.8]),
    c('DKK', 'kr', 2, [4.5, 10.5]),
    c('PLN', 'zł', 2, [7.5, 19]),
    c('CZK', 'Kč', 0, [1.3, 3.3]),
    c('HUF', 'Ft', 0, [0.09, 0.22]),
    c('ILS', '₪', 2, [9, 22]),
    c('EGP', 'E£', 2, [0.5, 1.8]),
    c('MAD', 'DH', 2, [3.2, 7.8]),
    c('SCR', 'SR', 2, [2, 5]),
    c('MGA', 'Ar', 0, [0.006, 0.016]),
    c('KES', 'KSh', 0, [0.22, 0.6]),
    c('TZS', 'TSh', 0, [0.01, 0.03]),
    c('MVR', 'Rf', 2, [2, 4.7]),
    c('LKR', 'Rs', 2, [0.09, 0.25]),
    c('PKR', 'Rs', 2, [0.1, 0.26]),
    c('NPR', 'Rs', 2, [0.2, 0.52]),
    c('BDT', '৳', 2, [0.24, 0.6]),
    c('BRL', 'R$', 2, [5, 14]),
    c('MXN', 'MX$', 2, [1.6, 4]),
  ]
    .map((x) => [x.code, x]),
);

export const CURRENCY_CODES = Object.keys(CURRENCIES);

export function currencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code];
}
