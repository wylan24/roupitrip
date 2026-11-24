// Suggests the trip currency from the device time zone, which phones update
// automatically on arrival. Locale is a weak signal for Mauritians (en-MU / fr-MU
// travel with them), so the time zone wins and the user always confirms.

const EUR_ZONES = [
  'Paris', 'Berlin', 'Madrid', 'Rome', 'Amsterdam', 'Brussels', 'Vienna', 'Lisbon', 'Dublin', 'Athens',
  'Helsinki', 'Luxembourg', 'Monaco', 'Bratislava', 'Ljubljana', 'Tallinn', 'Riga', 'Vilnius', 'Malta',
  'Zagreb', 'Nicosia', 'Andorra', 'San_Marino', 'Vatican', 'Podgorica',
].map((c) => `Europe/${c}`);

export const TIMEZONE_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EUR_ZONES.map((z) => [z, 'EUR'])),
  'Atlantic/Madeira': 'EUR', 'Atlantic/Canary': 'EUR', 'Indian/Reunion': 'EUR', 'Indian/Mayotte': 'EUR',
  'Europe/London': 'GBP', 'Europe/Zurich': 'CHF', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK', 'Europe/Warsaw': 'PLN', 'Europe/Prague': 'CZK', 'Europe/Budapest': 'HUF',
  'Europe/Istanbul': 'TRY', 'Asia/Istanbul': 'TRY',
  'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Qatar': 'QAR', 'Asia/Muscat': 'OMR', 'Asia/Bahrain': 'BHD',
  'Asia/Kuwait': 'KWD', 'Asia/Jerusalem': 'ILS', 'Asia/Tel_Aviv': 'ILS',
  'Asia/Bangkok': 'THB', 'Asia/Kuala_Lumpur': 'MYR', 'Asia/Kuching': 'MYR', 'Asia/Jakarta': 'IDR',
  'Asia/Makassar': 'IDR', 'Asia/Pontianak': 'IDR', 'Asia/Jayapura': 'IDR', 'Asia/Singapore': 'SGD',
  'Asia/Seoul': 'KRW', 'Asia/Tokyo': 'JPY', 'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD', 'Asia/Taipei': 'TWD',
  'Asia/Ho_Chi_Minh': 'VND', 'Asia/Saigon': 'VND', 'Asia/Manila': 'PHP',
  'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Colombo': 'LKR', 'Asia/Karachi': 'PKR',
  'Asia/Kathmandu': 'NPR', 'Asia/Katmandu': 'NPR', 'Asia/Dhaka': 'BDT', 'Indian/Maldives': 'MVR',
  'Africa/Cairo': 'EGP', 'Africa/Casablanca': 'MAD', 'Africa/Johannesburg': 'ZAR', 'Africa/Nairobi': 'KES',
  'Africa/Dar_es_Salaam': 'TZS', 'Indian/Mahe': 'SCR', 'Indian/Antananarivo': 'MGA',
  'Pacific/Auckland': 'NZD', 'Pacific/Honolulu': 'USD',
  'America/New_York': 'USD', 'America/Chicago': 'USD', 'America/Denver': 'USD', 'America/Phoenix': 'USD',
  'America/Los_Angeles': 'USD', 'America/Anchorage': 'USD', 'America/Detroit': 'USD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Montreal': 'CAD', 'America/Edmonton': 'CAD',
  'America/Winnipeg': 'CAD', 'America/Halifax': 'CAD',
  'America/Sao_Paulo': 'BRL', 'America/Mexico_City': 'MXN', 'America/Cancun': 'MXN',
};

/** Returns a suggested currency, or undefined at home in Mauritius / unknown zones. */
export function suggestCurrency(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string | undefined {
  if (!timeZone || timeZone === 'Indian/Mauritius') return undefined;
  if (TIMEZONE_CURRENCY[timeZone]) return TIMEZONE_CURRENCY[timeZone];
  if (timeZone.startsWith('Australia/')) return 'AUD';
  return undefined;
}
