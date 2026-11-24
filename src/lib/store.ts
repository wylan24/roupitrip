// Settings persisted on the device. Nothing here ever leaves the phone.
// Phase 2 (spending log) adds its own key alongside; keep this file the single
// place that touches localStorage.
import type { ConvertSettings } from './convert';

export type Lang = 'en' | 'fr';

export interface Settings extends ConvertSettings {
  trip: string;
  /** False until the user has confirmed a currency (or picked one). */
  tripConfirmed: boolean;
  recent: string[];
  lang: Lang;
  /** Last time-zone suggestion we asked about, so we only ask once per country. */
  askedFor?: string;
}

const KEY = 'roupitrip.settings.v1';
const MAX_RECENT = 4;

export const DEFAULT_SETTINGS: Settings = {
  trip: 'EUR',
  tripConfirmed: false,
  recent: [],
  rateType: 'card',
  cardFeePct: 2.75,
  rounding: 1,
  lang: 'en',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupted: fall back to defaults */
  }
  const lang: Lang = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return { ...DEFAULT_SETTINGS, lang };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}

export function withTrip(s: Settings, code: string): Settings {
  const recent = [code, ...s.recent.filter((c) => c !== code)].slice(0, MAX_RECENT);
  return { ...s, trip: code, tripConfirmed: true, recent };
}
