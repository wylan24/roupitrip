import type { Lang } from '../lib/store';
import { en, type StringKey } from './en';
import { fr } from './fr';

const tables: Record<Lang, Record<StringKey, string>> = { en, fr };
let lang: Lang = 'en';

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return tables[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const locale = () => (lang === 'fr' ? 'fr-MU' : 'en-MU');

/** "Euro", "Thai Baht" ... in the UI language. */
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function formatNumber(n: number, maxDecimals = 2, minDecimals = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: maxDecimals, minimumFractionDigits: minDecimals }).format(n);
}

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
