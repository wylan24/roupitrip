import type { App, Screen } from '../app';
import { currencyName, t } from '../i18n';
import type { Rounding } from '../lib/convert';
import { suggestCurrency } from '../lib/locale';
import type { Lang } from '../lib/store';
import { h, setChildren } from './dom';
import { pickCurrency } from './sheets';

function segmented<T extends string | number>(name: string, legend: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  return h('fieldset', { style: 'border:0;padding:0;margin:0' },
    h('legend', { class: 'visually-hidden' }, legend),
    h('div', { class: 'segmented' }, ...options.map(([v, label]) =>
      h('label', {},
        h('input', { type: 'radio', name, value: String(v), checked: v === value, onchange: () => onChange(v) }),
        h('span', {}, label),
      ),
    )),
  );
}

export function settingsScreen(app: App): Screen {
  const el = h('section', { class: 'screen', 'aria-labelledby': 'settings-title' });

  function render() {
    const s = app.settings;
    const suggested = suggestCurrency();
    const feeInput = h('input', {
      id: 'card-fee',
      type: 'number',
      inputmode: 'decimal',
      min: '0',
      max: '10',
      step: '0.05',
      value: String(s.cardFeePct),
      onchange: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(v) && v >= 0 && v <= 10) app.update({ cardFeePct: v });
      },
    });

    setChildren(el,
      h('h1', { id: 'settings-title' }, t('settings.title')),

      h('h2', {}, t('settings.trip')),
      h('div', { class: 'currency-current' },
        h('div', {}, h('strong', {}, s.trip), h('span', {}, currencyName(s.trip))),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const code = await pickCurrency(app);
          if (code) app.setTrip(code);
        } }, t('settings.change')),
      ),
      suggested && suggested !== s.trip && app.rate(suggested)
        ? h('div', { class: 'suggest' },
            h('p', { style: 'margin:0 0 8px' }, t('settings.suggested', { code: suggested })),
            h('button', { class: 'btn', type: 'button', onclick: () => app.setTrip(suggested) }, t('settings.useSuggested', { code: suggested })),
          )
        : null,

      h('h2', {}, t('settings.rateType')),
      segmented('rateType', t('settings.rateType'), [['card', t('settings.card')], ['cash', t('settings.cash')]], s.rateType, (v) => app.update({ rateType: v })),
      h('p', { class: 'help' }, s.rateType === 'card' ? t('settings.cardHelp') : t('settings.cashHelp')),

      s.rateType === 'card'
        ? h('div', {},
            h('h2', {}, h('label', { for: 'card-fee' }, t('settings.cardFee'))),
            h('div', { class: 'field-row' }, h('div', { class: 'fee-input' }, feeInput, h('span', { 'aria-hidden': 'true' }, ' %'))),
            h('p', { class: 'help' }, t('settings.cardFeeHelp')),
          )
        : null,

      h('h2', {}, t('settings.rounding')),
      segmented<Rounding>('rounding', t('settings.rounding'), [[1, 'Rs 1'], [5, 'Rs 5'], [10, 'Rs 10']], s.rounding, (v) => app.update({ rounding: v })),
      h('p', { class: 'help' }, t('settings.roundingHelp')),

      h('h2', {}, t('settings.language')),
      segmented<Lang>('lang', t('settings.language'), [['en', 'English'], ['fr', 'Français']], s.lang, (v) => app.update({ lang: v })),
    );
  }

  render();
  return { el, refresh: render };
}
