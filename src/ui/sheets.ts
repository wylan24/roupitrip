// Bottom sheets built on <dialog>: currency picker, price breakdown, trip confirm.
import type { App } from '../app';
import { currencyName, formatNumber, t } from '../i18n';
import { effectiveRate, toMur } from '../lib/convert';
import { CURRENCY_CODES } from '../lib/currencies';
import { suggestCurrency } from '../lib/locale';
import { h, setChildren, type Child } from './dom';
import { formatForeign, formatRate, formatRs } from './format';

function openSheet(build: (close: (v?: string) => void) => Child[], labelledBy = 'sheet-title'): Promise<string | undefined> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': labelledBy });
    const close = (v?: string) => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    // Tapping the backdrop closes the sheet.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    const body = h('div', { class: 'sheet-body' });
    setChildren(body, ...build(close));
    dialog.append(body);
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Lets the user pick a currency; resolves with its code, or undefined if dismissed. */
export function pickCurrency(app: App): Promise<string | undefined> {
  const suggested = suggestCurrency();
  const available = CURRENCY_CODES.filter((c) => app.rate(c)).sort((a, b) => currencyName(a).localeCompare(currencyName(b)));

  return openSheet((close) => {
    const list = h('div', { class: 'picker-list' });
    const search = h('input', {
      class: 'picker-search',
      type: 'search',
      placeholder: t('picker.search'),
      'aria-label': t('picker.search'),
      autocomplete: 'off',
    });

    const item = (code: string) => {
      const r = app.rate(code);
      return h(
        'button',
        { class: 'picker-item', type: 'button', 'aria-current': code === app.settings.trip ? 'true' : undefined, onclick: () => close(code) },
        h('strong', {}, code),
        h('span', {}, currencyName(code)),
        r ? h('span', { class: 'rate' }, formatRate(r.sellTT)) : null,
      );
    };

    const render = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      if (!q) {
        if (suggested && app.rate(suggested)) list.append(h('h3', {}, t('picker.suggested')), item(suggested));
        const recent = app.settings.recent.filter((c) => c !== suggested && app.rate(c));
        if (recent.length) list.append(h('h3', {}, t('picker.recent')), ...recent.map(item));
        list.append(h('h3', {}, t('picker.all')));
      }
      const matches = available.filter((c) => !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q));
      if (!matches.length) list.append(h('p', { class: 'help' }, t('picker.noResults', { q: search.value })));
      list.append(...matches.map(item));
    };
    search.addEventListener('input', render);
    render();
    return [h('h2', { id: 'sheet-title' }, t('picker.title')), search, list];
  });
}

/** Explains how a converted amount was worked out. */
export function showBreakdown(app: App, amount: number, code: string): Promise<string | undefined> {
  const rate = app.rate(code);
  if (!rate) return Promise.resolve(undefined);
  const s = app.settings;
  const eff = effectiveRate(rate, s);
  const exact = toMur(amount, rate, s);

  const rows: [string, string][] = [];
  rows.push([eff.baseKind === 'sellNotes' ? t('breakdown.cashRate') : t('breakdown.ttRate'), formatRate(eff.base)]);
  if (s.rateType === 'card') {
    rows.push([t('breakdown.cardFee'), `${eff.feePct} %`]);
    rows.push([t('breakdown.perUnit', { code }), formatRate(eff.perUnit)]);
  }
  rows.push([t('breakdown.exact'), `Rs ${formatNumber(exact, 2, 2)}`]);

  return openSheet((close) => [
    h('h2', { id: 'sheet-title' }, t('breakdown.title')),
    h(
      'dl',
      { class: 'breakdown' },
      h('dt', {}, t('breakdown.price')),
      h('dd', { class: 'total' }, formatForeign(amount, code)),
      ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      h('dt', {}, t('breakdown.shown')),
      h('dd', { class: 'total' }, `≈ ${formatRs(exact, s.rounding)}`),
    ),
    eff.noCashRate ? h('p', { class: 'note' }, t('breakdown.noCash', { code })) : null,
    rate.estimated ? h('p', { class: 'note' }, t('breakdown.estimated', { code })) : null,
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close('convert') }, t('breakdown.openConverter')),
      h('button', { class: 'btn', type: 'button', onclick: () => close() }, t('breakdown.close')),
    ),
  ]);
}

/** First run / new country: confirm the currency suggested by the time zone. */
export async function confirmTrip(app: App, code: string): Promise<void> {
  const answer = await openSheet((close) => [
    h('h2', { id: 'sheet-title' }, t('confirm.title', { name: currencyName(code) })),
    h('p', {}, t('confirm.body', { code })),
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close('yes') }, t('confirm.yes', { code })),
      h('button', { class: 'btn', type: 'button', onclick: () => close('other') }, t('confirm.other')),
    ),
  ]);
  app.update({ askedFor: code });
  if (answer === 'yes') app.setTrip(code);
  else if (answer === 'other') {
    const picked = await pickCurrency(app);
    if (picked) app.setTrip(picked);
  }
}
