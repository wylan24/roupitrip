// Manual converter: big keypad, foreign <-> Rs, quick amount chips.
import type { App, Screen } from '../app';
import { formatNumber, t } from '../i18n';
import { effectiveRate, fromMur, toMur } from '../lib/convert';
import { h, icon, ICONS } from './dom';
import { formatForeign, formatRate, formatRs } from './format';
import { pickCurrency, showBreakdown } from './sheets';

const CHIPS = [1, 5, 10, 20, 50, 100];
const MAX_DIGITS = 10;

export function converterScreen(app: App): Screen {
  let input = '';
  let toMurDir = true;
  if (app.pendingAmount) {
    if (app.pendingAmount.code !== app.settings.trip) app.setTrip(app.pendingAmount.code);
    input = String(app.pendingAmount.amount);
    app.pendingAmount = undefined;
  }

  const currencyBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const code = await pickCurrency(app);
    if (code) app.setTrip(code);
  } });
  const dirLabel = h('span', { class: 'dir' });
  const swapBtn = h('button', { class: 'btn', type: 'button', 'aria-label': t('convert.swap'), onclick: () => {
    toMurDir = !toMurDir;
    render();
  } }, icon(ICONS.swap));

  const inputEl = h('div', { class: 'conv-input', 'aria-live': 'off' });
  const resultLabel = h('div', { class: 'conv-label' });
  const resultEl = h('button', { class: 'conv-result', type: 'button', style: 'border:0;background:none;padding:0;text-align:right', 'aria-live': 'polite', onclick: () => {
    const n = Number(input);
    if (toMurDir && n > 0) void showBreakdown(app, n, app.settings.trip);
  } });
  const meta = h('div', { class: 'conv-meta' });

  const press = (key: string) => {
    if (key === 'del') input = input.slice(0, -1);
    else if (key === 'clear') input = '';
    else if (key === '.') {
      if (!input.includes('.')) input = (input || '0') + '.';
    } else if (input.replace('.', '').length < MAX_DIGITS) {
      const decimals = input.split('.')[1];
      if (decimals !== undefined && decimals.length >= 3) return;
      input = input === '0' ? key : input + key;
    }
    render();
  };

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'];
  const sep = formatNumber(1.5, 1).replace(/\d/g, '');
  const keypad = h('div', { class: 'keypad' }, ...keys.map((k) =>
    h('button', {
      type: 'button',
      'aria-label': k === 'del' ? t('convert.delete') : undefined,
      onclick: () => press(k),
      // Long-press delete clears everything.
      oncontextmenu: k === 'del' ? (e: Event) => { e.preventDefault(); press('clear'); } : undefined,
    }, k === 'del' ? '⌫' : k === '.' ? sep : k),
  ));
  const chips = h('div', { class: 'chips' }, ...CHIPS.map((n) => h('button', { type: 'button', onclick: () => { input = String(n); render(); } }, String(n))));

  const el = h('section', { class: 'converter', 'aria-label': t('tab.convert') },
    h('div', { class: 'conv-head' }, currencyBtn, dirLabel, swapBtn),
    h('div', { class: 'conv-display' }, inputEl, resultLabel, resultEl, meta),
    chips,
    keypad,
  );

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === '.' || e.key === ',') press('.');
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Escape') press('clear');
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  function render() {
    const code = app.settings.trip;
    const rate = app.rate(code);
    const s = app.settings;
    currencyBtn.replaceChildren(h('span', {}, code), icon(ICONS.chevron));
    currencyBtn.setAttribute('aria-label', `${code}, ${t('settings.change')}`);
    dirLabel.textContent = toMurDir ? t('convert.toMur', { code }) : t('convert.fromMur', { code });

    const n = Number(input || '0');
    const shownInput = input ? formatNumber(n, 3) + (input.endsWith('.') ? sep : '') : '0';
    inputEl.textContent = toMurDir ? `${code} ${shownInput}` : `Rs ${shownInput}`;
    resultLabel.textContent = input ? (toMurDir ? t('convert.youPay') : t('convert.youGet')) : t('convert.enterAmount');

    if (!rate) {
      resultEl.textContent = '–';
      meta.textContent = t('banner.noRates');
      return;
    }
    resultEl.textContent = toMurDir ? `≈ ${formatRs(toMur(n, rate, s), s.rounding)}` : `≈ ${formatForeign(fromMur(n, rate, s), code)}`;
    const eff = effectiveRate(rate, s);
    const how = s.rateType === 'card' ? t('convert.cardRate', { fee: eff.feePct }) : eff.noCashRate ? t('convert.transferRate') : t('convert.cashRate');
    meta.textContent = `1 ${code} = ${formatRate(eff.perUnit)}, ${how}`;
  }

  render();
  return {
    el,
    refresh: render,
    unmount: () => document.removeEventListener('keydown', onKey),
  };
}
