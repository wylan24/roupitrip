import type { App, Screen } from '../app';
import { currencyName, formatDate, formatNumber, t } from '../i18n';
import { h, setChildren } from './dom';

export const STALE_AFTER_DAYS = 3;
const REPO_URL = 'https://github.com/wylan24/roupitrip';
const num = (v: number) => formatNumber(v, v < 1 ? 6 : 4, 2);

export function infoScreen(app: App): Screen {
  const el = h('section', { class: 'screen', 'aria-labelledby': 'info-title' });

  function render() {
    const r = app.rates;
    const age = app.ratesAgeDays();
    const rows = r
      ? Object.entries(r.rates).map(([code, rate]) =>
          h('tr', {},
            h('td', {}, h('strong', {}, code), h('small', {}, rate.estimated ? `${currencyName(code)}, ${t('info.estimatedMark')}` : currencyName(code))),
            h('td', {}, rate.sellNotes ? num(rate.sellNotes) : '–'),
            h('td', {}, num(rate.sellTT)),
          ),
        )
      : [];

    setChildren(el,
      h('h1', { id: 'info-title' }, t('info.title')),
      r ? h('p', {}, t('info.source', { date: formatDate(r.bomDate) })) : h('p', { class: 'warn' }, t('banner.noRates')),
      age !== undefined && age > STALE_AFTER_DAYS ? h('p', { class: 'warn' }, t('info.stale', { days: age })) : null,
      r?.marketDate ? h('p', { class: 'help' }, t('info.market', { date: formatDate(r.marketDate) })) : null,
      h('p', {}, t('info.disclaimer')),
      h('p', {}, t('info.privacy')),
      h('p', { class: 'help' }, t('info.offlineReady')),
      r
        ? h('div', {},
            h('h2', {}, t('info.ratesTable')),
            h('table', { class: 'rates-table' },
              h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), h('th', { scope: 'col' }, t('info.colCash')), h('th', { scope: 'col' }, t('info.colCard')))),
              h('tbody', {}, ...rows),
            ),
          )
        : null,
      h('p', { class: 'info-links' },
        h('a', { href: 'https://www.exchangerate-api.com', rel: 'noopener', target: '_blank' }, t('info.attribution')),
        h('br'),
        h('a', { href: 'https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates', rel: 'noopener', target: '_blank' }, 'Bank of Mauritius'),
        h('br'),
        h('a', { href: REPO_URL, rel: 'noopener', target: '_blank' }, t('info.sourceCode')),
      ),
    );
  }

  render();
  return { el, refresh: render };
}
