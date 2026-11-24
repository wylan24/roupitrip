import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-next/800.css';
import './styles.css';
import { App, ROUTES, type Route, type Screen } from './app';
import { formatDate, t } from './i18n';
import { suggestCurrency } from './lib/locale';
import type { RatesFile } from './lib/rates';
import { cameraScreen } from './ui/camera';
import { converterScreen } from './ui/converter';
import { h, icon, ICONS } from './ui/dom';
import { infoScreen, STALE_AFTER_DAYS } from './ui/info';
import { settingsScreen } from './ui/settings';
import { confirmTrip } from './ui/sheets';

const app = new App();
const SCREENS: Record<Route, (a: App) => Screen> = {
  camera: cameraScreen,
  convert: converterScreen,
  settings: settingsScreen,
  info: infoScreen,
};

const banner = h('div', { class: 'banner', role: 'status' });
const main = h('main', { id: 'main' });
const tabbar = h('nav', { class: 'tabbar' });
const shell = h('div', { class: 'app' }, banner, main, tabbar);
document.getElementById('root')!.replaceWith(shell);

let current: { route: Route; screen: Screen } | undefined;

function routeFromHash(): Route {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'camera';
}

function renderTabs(active: Route) {
  const label: Record<Route, string> = { camera: t('tab.camera'), convert: t('tab.convert'), settings: t('tab.settings'), info: t('tab.info') };
  tabbar.setAttribute('aria-label', 'RoupiTrip');
  tabbar.replaceChildren(...ROUTES.map((r) =>
    h('a', { href: `#/${r}`, 'aria-current': r === active ? 'page' : undefined }, icon(ICONS[r]), label[r]),
  ));
}

function renderBanner() {
  const age = app.ratesAgeDays();
  let text = '';
  if (!app.rates) text = t('banner.noRates');
  else if (app.ratesOffline) text = t('banner.offline', { date: formatDate(app.rates.bomDate) });
  else if (age !== undefined && age > STALE_AFTER_DAYS) text = t('banner.stale', { days: age });
  banner.textContent = text;
}

function navigate() {
  const route = routeFromHash();
  if (current?.route === route) return;
  current?.screen.unmount?.();
  const screen = SCREENS[route](app);
  current = { route, screen };
  shell.dataset.route = route;
  main.replaceChildren(screen.el);
  main.scrollTop = 0;
  renderTabs(route);
}

app.onChange(() => {
  renderBanner();
  renderTabs(current?.route ?? 'camera');
  current?.screen.refresh?.();
});
window.addEventListener('hashchange', navigate);
window.addEventListener('online', () => void loadRates());
window.addEventListener('offline', renderBanner);

async function loadRates() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}rates.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as RatesFile;
    app.setRates(data, res.headers.get('x-roupitrip-cache') === 'offline' || !navigator.onLine);
  } catch {
    app.setRates(app.rates, true);
  }
}

async function maybeConfirmTrip() {
  const suggested = suggestCurrency();
  if (!suggested || !app.rate(suggested)) return;
  if (suggested === app.settings.trip || suggested === app.settings.askedFor) return;
  await confirmTrip(app, suggested);
}

navigate();
renderBanner();
await loadRates();
await maybeConfirmTrip();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
