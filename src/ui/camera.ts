// Camera mode: live rear camera, on-device OCR of the aim box every ~700 ms,
// and a price tag pinned to each price found. Frames never leave the device.
import type { App, Screen } from '../app';
import { t } from '../i18n';
import { toMur } from '../lib/convert';
import { pricesInLine, type LocatedPrice } from '../lib/ocrPrices';
import { loadOcr, readLines } from '../ocr/ocr';
import { h, icon, ICONS } from './dom';
import { formatForeign, formatRs } from './format';
import { pickCurrency, showBreakdown } from './sheets';

const SCAN_INTERVAL_MS = 700;
const CANT_READ_AFTER_MS = 8000;
const MAX_TAGS = 8;
/** OCR works best with text roughly 20–40 px tall; scale the crop towards this width. */
const OCR_TARGET_WIDTH = 1200;

interface Mapping {
  sx: number;
  sy: number;
  k: number;
  scale: number;
  offX: number;
  offY: number;
}

export function cameraScreen(app: App): Screen {
  const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' });
  const frozen = h('canvas', { class: 'frozen', 'aria-hidden': 'true' });
  const work = document.createElement('canvas');
  const aim = h('div', { class: 'aim', 'aria-hidden': 'true' });
  const tags = h('div', { class: 'tags' });
  const hint = h('div', { class: 'camera-hint', role: 'status' });
  const cantRead = h('button', { class: 'camera-hint action', type: 'button', hidden: true, onclick: () => app.go('convert') }, t('camera.cantRead'));

  const currencyPill = h('button', { class: 'pill', type: 'button', onclick: async () => {
    const code = await pickCurrency(app);
    if (code) app.setTrip(code);
  } });
  const ratePill = h('button', { class: 'pill', type: 'button', onclick: () => app.update({ rateType: app.settings.rateType === 'card' ? 'cash' : 'card' }) });

  const shutter = h('button', { class: 'shutter', type: 'button', onclick: () => (isFrozen ? unfreeze() : freeze()) });
  const typeBtn = h('button', { class: 'pill side', type: 'button', onclick: () => app.go('convert') }, icon(ICONS.keypad), t('camera.type'));
  const message = h('div', { class: 'camera-message', hidden: true });

  const el = h('section', { class: 'camera', 'aria-label': t('tab.camera') },
    video, frozen, aim, tags,
    h('div', { class: 'camera-top' }, currencyPill, ratePill),
    hint, cantRead,
    h('div', { class: 'camera-controls' }, typeBtn, shutter, h('span', { class: 'side' })),
    message,
  );

  let stream: MediaStream | undefined;
  let timer: number | undefined;
  let busy = false;
  let isFrozen = false;
  let alive = true;
  let ocrReady = false;
  let lastFoundAt = 0;
  let scanNow = false;
  let lastPrices: LocatedPrice[] = [];
  let lastMapping: Mapping | undefined;

  function layoutAim() {
    const W = el.clientWidth;
    const H = el.clientHeight;
    const w = Math.min(W - 32, 560);
    const hgt = Math.min(H * 0.34, 300);
    const top = Math.max(84, H * 0.42 - hgt / 2);
    Object.assign(aim.style, { left: `${(W - w) / 2}px`, top: `${top}px`, width: `${w}px`, height: `${hgt}px` });
    hint.style.top = cantRead.style.top = `${top + hgt + 14}px`;
  }

  function showMessage(title: string, body: string, actions: HTMLElement[] = []) {
    message.hidden = false;
    message.replaceChildren(h('h2', {}, title), h('p', {}, body), ...actions);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showMessage(t('camera.noCamera'), t('camera.privacy'), [goTypeButton()]);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (err) {
      const denied = (err as DOMException).name === 'NotAllowedError';
      showMessage(denied ? t('camera.denied') : t('camera.noCamera'), denied ? t('camera.deniedHelp') : t('camera.privacy'), [
        h('button', { class: 'btn', type: 'button', onclick: () => { message.hidden = true; void start(); } }, t('camera.start')),
        goTypeButton(),
      ]);
      return;
    }
    if (!alive) return stopStream();
    message.hidden = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    if (!ocrReady) {
      hint.textContent = t('camera.loadingOcr', { pct: 0 });
      try {
        await loadOcr((f) => (hint.textContent = t('camera.loadingOcr', { pct: Math.round(f * 100) })));
        ocrReady = true;
      } catch {
        showMessage(t('camera.ocrFailed'), t('camera.privacy'), [goTypeButton()]);
        return;
      }
    }
    hint.textContent = t('camera.aim');
    lastFoundAt = performance.now();
    loop();
  }

  function goTypeButton() {
    return h('button', { class: 'btn btn-primary', type: 'button', onclick: () => app.go('convert') }, t('camera.type'));
  }

  function stopStream() {
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = undefined;
  }

  function loop() {
    window.clearTimeout(timer);
    if (!alive) return;
    const started = performance.now();
    const next = () => {
      const wait = scanNow ? 0 : Math.max(0, SCAN_INTERVAL_MS - (performance.now() - started));
      timer = window.setTimeout(loop, wait);
    };
    if (isFrozen || busy || document.hidden || !video.videoWidth) return next();
    scanNow = false;
    void scan(video).finally(next);
  }

  /** Maps screen pixels to source pixels for an object-fit: cover element. */
  function mapping(srcW: number, srcH: number): Mapping {
    const W = el.clientWidth;
    const H = el.clientHeight;
    const scale = Math.max(W / srcW, H / srcH);
    const offX = (W - srcW * scale) / 2;
    const offY = (H - srcH * scale) / 2;
    const a = aim.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const sx = Math.max(0, (a.left - r.left - offX) / scale);
    const sy = Math.max(0, (a.top - r.top - offY) / scale);
    const sw = Math.min(srcW - sx, a.width / scale);
    const k = Math.min(2, Math.max(0.5, OCR_TARGET_WIDTH / sw));
    return { sx, sy, k, scale, offX, offY };
  }

  async function scan(source: HTMLVideoElement | HTMLCanvasElement) {
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!srcW || !srcH) return;
    busy = true;
    try {
      const m = mapping(srcW, srcH);
      const a = aim.getBoundingClientRect();
      const sw = Math.min(srcW - m.sx, a.width / m.scale);
      const sh = Math.min(srcH - m.sy, a.height / m.scale);
      work.width = Math.round(sw * m.k);
      work.height = Math.round(sh * m.k);
      const ctx = work.getContext('2d', { willReadFrequently: true })!;
      ctx.filter = 'grayscale(1) contrast(1.25)';
      ctx.drawImage(source, m.sx, m.sy, sw, sh, 0, 0, work.width, work.height);

      const lines = await readLines(work);
      if (!alive) return;
      const prices = lines.flatMap((l) => pricesInLine(l, app.settings.trip)).slice(0, MAX_TAGS);
      if (prices.length) {
        lastFoundAt = performance.now();
        cantRead.hidden = true;
      } else if (performance.now() - lastFoundAt > CANT_READ_AFTER_MS) {
        cantRead.hidden = false;
      }
      // In live mode keep the previous tags for one empty frame to avoid flicker.
      if (prices.length || isFrozen || !lastPrices.length) renderTags(prices, m);
      lastPrices = prices;
      hint.hidden = prices.length > 0;
      if (prices.length) hint.textContent = t('camera.tapLabel');
    } finally {
      busy = false;
    }
  }

  function renderTags(prices: LocatedPrice[], m: Mapping) {
    lastMapping = m;
    tags.replaceChildren();
    const W = el.clientWidth;
    const s = app.settings;
    const toScreen = (p: LocatedPrice) => ({
      x0: (p.bbox.x0 / m.k + m.sx) * m.scale + m.offX,
      y0: (p.bbox.y0 / m.k + m.sy) * m.scale + m.offY,
      x1: (p.bbox.x1 / m.k + m.sx) * m.scale + m.offX,
      y1: (p.bbox.y1 / m.k + m.sy) * m.scale + m.offY,
    });
    const boxes = prices.map(toScreen);
    // Menus: prices stacked closely. Hang compact tags beside each price instead of above.
    const ys = boxes.map((b) => b.y0).sort((a, b) => a - b);
    const compact = ys.some((y, i) => i > 0 && y - ys[i - 1] < 64);

    prices.forEach((p, i) => {
      const rate = app.rate(p.currency);
      if (!rate) return;
      const { x0, y0, x1, y1 } = boxes[i];
      const box = h('div', {
        class: 'read-box',
        'data-bare': p.explicit ? undefined : true,
        style: `left:${x0 - 3}px;top:${y0 - 3}px;width:${x1 - x0 + 6}px;height:${y1 - y0 + 6}px`,
      });
      const rs = formatRs(toMur(p.value, rate, s), s.rounding);
      const from = formatForeign(p.value, p.currency);
      const tag = h('button', {
        class: 'tag',
        type: 'button',
        'aria-label': `${from} ≈ ${rs}`,
        onclick: async () => {
          if (!isFrozen) freeze(false);
          const next = await showBreakdown(app, p.value, p.currency);
          if (next === 'convert') {
            app.pendingAmount = { amount: p.value, code: p.currency };
            app.go('convert');
          }
        },
      }, h('span', { class: 'from' }, from), h('span', { class: 'to' }, `≈ ${rs}`));
      const pin = h('div', { class: 'tag-pin', 'data-compact': compact || undefined }, tag);
      tags.append(box, pin);

      const tw = pin.offsetWidth;
      const th = pin.offsetHeight;
      const midY = (y0 + y1) / 2 - th / 2;
      if (compact && x0 - tw - 10 >= 8) {
        pin.dataset.side = 'left';
        Object.assign(pin.style, { left: `${x0 - tw - 10}px`, top: `${midY}px` });
      } else if (compact && x1 + tw + 10 <= W - 8) {
        pin.dataset.side = 'right';
        Object.assign(pin.style, { left: `${x1 + 10}px`, top: `${midY}px` });
      } else {
        // Hang the tag above the price; flip below if it would hit the top controls.
        let top = y0 - th - 14;
        if (top < 76) {
          top = y1 + 14;
          pin.style.setProperty('--string', '0px');
        }
        Object.assign(pin.style, { left: `${Math.min(Math.max(8, x0 - 8), W - tw - 8)}px`, top: `${top}px` });
      }
    });
  }

  function freeze(rescan = true) {
    if (!video.videoWidth) return;
    isFrozen = true;
    frozen.width = video.videoWidth;
    frozen.height = video.videoHeight;
    frozen.getContext('2d')!.drawImage(video, 0, 0);
    el.setAttribute('data-frozen', '');
    video.pause();
    renderControls();
    if (rescan) {
      const go = () => (busy ? window.setTimeout(go, 100) : void scan(frozen));
      go();
    }
  }

  function unfreeze() {
    isFrozen = false;
    el.removeAttribute('data-frozen');
    tags.replaceChildren();
    lastPrices = [];
    void video.play();
    renderControls();
    scanNow = true;
  }

  function renderControls() {
    const s = app.settings;
    currencyPill.replaceChildren(s.trip, icon(ICONS.chevron));
    currencyPill.setAttribute('aria-label', `${s.trip}, ${t('settings.change')}`);
    ratePill.textContent = s.rateType === 'card' ? `${t('settings.card')} +${s.cardFeePct} %` : t('settings.cash');
    shutter.textContent = isFrozen ? t('camera.resume') : t('camera.freeze');
    shutter.setAttribute('aria-pressed', String(isFrozen));
  }

  // Tapping the picture (not a control) scans immediately.
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target === video || e.target === tags) scanNow = true;
  });

  const onResize = () => layoutAim();
  const onVisibility = () => {
    if (!document.hidden && alive && stream && stream.getVideoTracks().every((tr) => tr.readyState === 'ended')) {
      stopStream();
      void start();
    }
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  renderControls();
  requestAnimationFrame(() => {
    layoutAim();
    void start();
  });

  return {
    el,
    refresh() {
      renderControls();
      if (lastMapping) renderTags(lastPrices, lastMapping);
    },
    unmount() {
      alive = false;
      window.clearTimeout(timer);
      stopStream();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
