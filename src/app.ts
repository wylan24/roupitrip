// App-wide state: settings, rates and navigation. Screens subscribe to changes.
import { setLang } from './i18n';
import type { Rate, RatesFile } from './lib/rates';
import { loadSettings, saveSettings, withTrip, type Settings } from './lib/store';

export type Route = 'camera' | 'convert' | 'settings' | 'info';
export const ROUTES: Route[] = ['camera', 'convert', 'settings', 'info'];

export interface Screen {
  el: HTMLElement;
  /** Called when settings or rates change while the screen is shown. */
  refresh?(): void;
  unmount?(): void;
}

type Listener = () => void;

export class App {
  settings: Settings = loadSettings();
  rates?: RatesFile;
  /** True when rates came from the offline cache rather than the network. */
  ratesOffline = false;
  /** Handed from the camera to the converter ("Edit in converter"). */
  pendingAmount?: { amount: number; code: string };
  private listeners = new Set<Listener>();

  constructor() {
    setLang(this.settings.lang);
  }

  update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    if (patch.lang) setLang(patch.lang);
    saveSettings(this.settings);
    this.emit();
  }

  setTrip(code: string) {
    this.settings = withTrip(this.settings, code);
    saveSettings(this.settings);
    this.emit();
  }

  setRates(rates: RatesFile | undefined, offline: boolean) {
    this.rates = rates;
    this.ratesOffline = offline;
    this.emit();
  }

  rate(code = this.settings.trip): Rate | undefined {
    return this.rates?.rates[code];
  }

  /** Whole days since BoM published the rates in use. */
  ratesAgeDays(now = new Date()): number | undefined {
    if (!this.rates) return undefined;
    const published = new Date(`${this.rates.bomDate}T00:00:00+04:00`);
    return Math.floor((now.getTime() - published.getTime()) / 86_400_000);
  }

  go(route: Route) {
    location.hash = `#/${route}`;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
