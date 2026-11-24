# RoupiTrip

Point your phone at a price abroad and see it in Mauritian rupees.

RoupiTrip is a Progressive Web App for Mauritians travelling abroad. It reads prices on tags and menus with the phone camera and pins a tag reading **≈ Rs 612** next to each one. It works offline, has no accounts and no tracking, and camera frames never leave the phone: text recognition runs on the device with Tesseract.js.

> Rates are the Bank of Mauritius **indicative** exchange rates and are for information only. Your bank or exchange bureau applies its own rates and fees.

## What's in the box

| Screen | What it does |
| --- | --- |
| Camera | Rear camera with an aim box, read every ~700 ms or when you tap. A price tag is pinned to each price found. Tap a tag to freeze the frame and see how the amount was worked out. **Freeze** pauses the frame so you can read a menu. **Type it** opens the keypad. |
| Convert | Large keypad, foreign → Rs and Rs → foreign, quick amounts (1, 5, 10, 20, 50, 100). |
| Settings | Trip currency (suggested from the phone's time zone, which you confirm), Card or Cash rate, card fee, rounding (Rs 1 / 5 / 10), English / Français. |
| Info | Rate dates, a warning when rates are more than 3 days old, the full rate table, disclaimer, privacy note and attribution. |

### Which rate is used

All rates are stored as **Rs per 1 unit** of the foreign currency.

- **Cash** uses BoM `SELL_NOTES`: what a Mauritian bank charges you for foreign banknotes. If no notes rate is published (CNY, for example), it falls back to `SELL_TT` and says so.
- **Card** uses BoM `SELL_TT` plus your card's foreign-transaction fee. The default fee is **2.75 %**. Mauritian banks typically charge 2–3 %; MCB's published tariffs list 2–2.5 % depending on the card. The fee is editable in Settings.
- **Currencies BoM doesn't quote** (THB, AED, IDR, TRY, KRW…) use the daily mid-market rate from ExchangeRate-API, widened by the median BoM bank spread so they compare fairly with BoM currencies. They're marked `"source": "market", "estimated": true`, and the app says so.

## Bank of Mauritius source: what the page looks like

This was checked on 24 Nov 2026 before the scraper was written.

- `…/foreign-exchange/indicative-exchange-rate` lists **one table per bank or dealer** (ABC, Absa, AfrAsia, BCP, Bank One…). Rows are labelled by country name (`EMU`, `U.K`, `U.S.A`…) with no ISO code or unit, and coverage differs per bank. Not ideal.
- `…/indicative-exchange-rate/rss` returns the **same HTML page**, not an RSS/XML feed.
- **`…/foreign-exchange/consolidated-indicative-exchange-rates`** (the one we use) has a single table:

  | Country | Code | Buying T.T | Buying D.D | Buying Notes | Selling T.T/D.D | Selling Notes | Date |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | EMU | EUR 1 | 50.6043 | 50.4873 | 50.3384 | 52.1201 | 52.2022 | 24-11-2026 |
  | JAPAN | JPY 100 | 29.1822 | 28.8217 | 28.6983 | 30.0546 | 30.0826 | 24-11-2026 |

  It covers 12 currencies: AUD, CAD, CNY, EUR, INR, JPY, NZD, SGD, ZAR, CHF, GBP, USD. The **Code column carries the quotation unit**: JPY is quoted per 100, everything else per 1. The scraper divides by the unit, then checks every result against a per-currency sanity range, so a unit mistake fails the job instead of publishing a rate 100× off. The page has no separate `BUY_TT`/`SELL_TCDD` split: T.T and D.D share one selling column.

## Project layout

```
pipeline/            rates pipeline (Node, runs in GitHub Actions)
  bom.ts             BoM consolidated-page parser + explicit country→ISO mapping
  market.ts          ExchangeRate-API fallback (Rs per unit from a USD base)
  build.ts           merge, sanity ranges, >10 % move check, change detection
scripts/
  update-rates.ts    the daily job: fetch → validate → write public/rates.json
  copy-ocr-assets.mjs  copies Tesseract worker/core/English data into public/tesseract
src/
  lib/               pure logic, unit tested: currencies, parsePrice, convert, locale, store, ocrPrices
  ocr/ocr.ts         lazy Tesseract worker (self-hosted assets, LSTM only)
  ui/                camera, converter, settings, info, sheets (picker / breakdown / confirm)
  i18n/              en.ts, fr.ts (same keys, type-checked)
  sw.js              service worker (build injects the precache list)
tests/               vitest, with a saved BoM page in tests/fixtures/
public/              rates.json, manifest, icons
```

## Local development

Requires Node 20+.

```bash
npm install
```

`npm install` also copies the OCR assets into `public/tesseract/`. They're git-ignored and recreated on every install.

```bash
npm run dev
```

Opens the app on <http://localhost:5173>. Camera access works on `localhost`. To try it on your phone, the page must be served over HTTPS, so use the deployed site, or a tunnel such as `npx cloudflared tunnel --url http://localhost:5173`.

```bash
npm test
```

Runs the unit tests (price parsing, BoM parsing, mapping, units, validation, conversion and fees).

```bash
npm run build && npm run preview
```

Builds the production version with the service worker enabled.

```bash
npm run rates
```

Fetches today's rates and rewrites `public/rates.json`. Add `-- --dry-run` to only print them.

If you're behind a TLS-inspecting corporate proxy (Netskope, Zscaler…), Node may refuse the HTTPS connection. Download the pages with curl and feed them in:

```bash
curl -sL -A "RoupiTrip-rates" https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates -o /tmp/bom.html
```

```bash
curl -s https://open.er-api.com/v6/latest/USD -o /tmp/market.json
```

```bash
npm run rates -- --bom-html /tmp/bom.html --market-json /tmp/market.json
```

## Deploying (GitHub Pages)

1. Push to `main`. `.github/workflows/deploy.yml` tests, builds with `BASE_PATH=/<repo-name>/` and publishes `dist/` to GitHub Pages.
2. In the repository settings, under **Pages → Build and deployment**, the source must be **GitHub Actions**. This is already set for this repo.
3. The site is served at `https://<user>.github.io/<repo>/`. Open it on your phone, then use **Add to Home Screen**. Open the Camera tab once while online so the text reader (about 7 MB) is cached for offline use.

To host on Cloudflare Pages instead, use the build command `npm run build`, output directory `dist`, and leave `BASE_PATH` unset.

## The daily rates job

`.github/workflows/rates.yml` runs **weekdays at 06:00 UTC (10:00 Mauritius time)**, and can also be triggered by hand from the Actions tab.

1. Runs the unit tests.
2. Checks `bom.mu/robots.txt` still allows the page (it sets `Crawl-delay: 10` and doesn't disallow `/markets/`), then makes **one** request for the consolidated page, with a descriptive User-Agent.
3. Makes one request to ExchangeRate-API for the other currencies. If that fails, the job carries on with BoM rates only.
4. Validates the result and **refuses to publish** if:
   - the table headers changed, an unknown country appears, or a code/unit doesn't match the mapping,
   - fewer than 10 currencies (or fewer than 10 BoM currencies) were parsed,
   - any rate falls outside its sanity range (catches per-100 vs per-1 mistakes),
   - any mid rate moved more than 10 % since the published file,
   - the BoM date goes backwards.

   On failure the job exits non-zero, `public/rates.json` is left as it was, and GitHub emails you about the failed scheduled run.
5. Commits `public/rates.json` only if the rates changed (the timestamp alone doesn't count), then calls the deploy workflow.

## Adding a currency

1. **Add it to the app** in `src/lib/currencies.ts`: `c('ISK', 'kr', 0, [0.2, 0.55])`. That's the ISO code, display symbol, usual decimals, and a plausible Rs-per-unit range (roughly ±40 % around today's rate).
2. **If BoM starts publishing it** in the consolidated table, make sure its country label is in `BOM_COUNTRY_TO_ISO` in `pipeline/bom.ts`. Labels are normalised (upper case, trailing dots and `***` removed). An unknown label fails the job with `Unknown BoM country "…"`, which is your cue to add it.
3. **Optionally**, add the symbol to `MARKERS` in `src/lib/parsePrice.ts` and the time zones to `src/lib/locale.ts`.
4. Run `npm test`. The pipeline test checks that every currency in the app has a rate in the fixture build.

## Privacy

- Camera frames are processed in a Web Worker on the device and never uploaded.
- No analytics, no cookies, no accounts. Settings live in `localStorage` on the phone.
- The only network requests are for the app itself and `rates.json`, both from the same origin.

## Phase 2 ideas (code is structured for these)

- Trip spending log totalled in Rs: add a key next to the settings in `src/lib/store.ts`, and a "Log it" action on the breakdown sheet.
- Home-screen quick view: a manifest `shortcuts` entry to `#/convert`.
- More languages: add `src/i18n/<lang>.ts` with the same keys.

## Credits

- Exchange rates: [Bank of Mauritius](https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates) indicative rates.
- [Rates By Exchange Rate API](https://www.exchangerate-api.com) for currencies BoM doesn't quote.
- OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).
- Typeface: [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) by the Braille Institute (OFL).
