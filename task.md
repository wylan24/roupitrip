# RoupiTrip – what's left

Status as of 24 Nov 2026. Everything in the original brief is built and deployed:

- Live site: https://wylan24.github.io/roupitrip/
- Daily rates job: passing on GitHub Actions
- Unit tests: 118 passing (`npm test`)

This file lists what still needs testing, fixing or deciding.

## 0. Set up on Windows

1. Install Node 20 or newer (LTS) from https://nodejs.org and Git for Windows.
2. Clone and install:
   ```bash
   git clone https://github.com/wylan24/roupitrip.git
   cd roupitrip
   npm install
   ```
   `npm install` also copies the OCR files into `public/tesseract/`.
3. `npm test` should report 118 passing tests.
4. `npm run dev` opens http://localhost:5173. Camera access works on localhost in Chrome and Edge.
5. `npm run build`, then `npm run preview`, gives the production version with offline support.

Notes:
- Line endings are pinned to LF by `.gitattributes`, so `scripts/bom-intermediate.sh` keeps working in CI after a commit from Windows.
- `scripts/bom-intermediate.sh` only runs in GitHub Actions on Linux. Locally, `npm run rates` should work from a normal home network. The `--bom-html` / `--market-json` workaround in the README was only needed behind the office Netskope proxy; on Windows, use paths like `%TEMP%\bom.html`.
- To test on your phone from the laptop, use the deployed site, or a tunnel such as `npx cloudflared tunnel --url http://localhost:5173`, because phones need HTTPS for the camera.

## 1. Retry / verify on real devices (highest priority)

These were only tested with a simulated camera feed in a desktop browser.

- [ ] **Camera starts** on iPhone (Safari) and Android (Chrome): permission prompt, rear camera chosen, video fills the screen.
- [ ] **OCR speed on a phone.** Desktop took about 100 ms per read. If tags lag on a mid-range phone, raise `SCAN_INTERVAL_MS` or lower `OCR_TARGET_WIDTH` in `src/ui/camera.ts`.
- [ ] **Real price tags and menus.** Try glare, curved labels, small print, handwriting, and a coloured background. Note what's misread.
- [ ] **Tags line up with the prices** on screen, in portrait and on different phone sizes. The mapping is in `mapping()` in `src/ui/camera.ts`.
- [ ] **Freeze / Resume**, tapping a tag (breakdown sheet), and "Edit in converter".
- [ ] **"Can't read it? Type the price"** appears after about 8 s with nothing found.
- [ ] **Camera denied**: block the permission and check the message and the "Type it" fallback.
- [ ] **Offline**: open the Camera tab once online, enable airplane mode, reopen the app. It should load, read prices, and show "Offline. Using rates from …".
- [ ] **Install to home screen** on iOS and Android: icon, name, standalone display, status bar colour.
- [ ] **App update**: after a new deploy, the installed app picks up the new version on the next launch.

## 2. Screens not visually checked yet

- [ ] Light theme (set the phone or Windows to light mode). Only the dark theme was reviewed.
- [ ] French interface (Settings → Language → Français). Text length, wrapping and wording.
- [ ] "Paying in Thai baht?" confirm sheet. To trigger it, change the Windows time zone (e.g. to Bangkok) and clear site data.
- [ ] Currency picker search, plus the Recent and Suggested sections.
- [ ] Very small screens (320 px wide) and landscape.

## 3. Known gaps to fix

- [ ] **English-only OCR.** Thai or Arabic-script digits and Japanese/Chinese menus aren't read. Option: load extra Tesseract languages on demand per trip currency (e.g. `tha`, `jpn`), self-hosted like `eng`.
- [ ] **Currency symbols misread by OCR** (e.g. "฿" read as "B", "₹" dropped). The price then falls back to the trip currency, which is usually right. Could add common misreads to `MARKERS` in `src/lib/parsePrice.ts`, with tests.
- [ ] **Tag flicker** in live mode if OCR alternates between finding and missing a price. Consider matching tags across frames and smoothing positions.
- [ ] **No override for the 10 % daily-move check.** A real devaluation (EGP, TRY…) makes the job fail every day until the file is edited by hand. Add a `workflow_dispatch` input such as `allow_big_moves: true` that passes `--allow-moves` to the script.
- [ ] **Fonts**: both `.woff` and `.woff2` files are precached. Import only the woff2 files to save about 75 KB.

## 4. Decisions / confirmations

- [ ] **Card fee default (2.75 %)**: confirm against your bank's tariff sheet. MCB lists 2–2.5 % depending on the card; SBM wasn't found. Change `DEFAULT_SETTINGS.cardFeePct` in `src/lib/store.ts` and the help text in `src/i18n/en.ts` / `fr.ts`.
- [ ] **ExchangeRate-API terms**: read https://www.exchangerate-api.com/terms and confirm the attribution on the Info screen is enough.
- [ ] **French wording**: have a native speaker review `src/i18n/fr.ts`.
- [ ] **Licence**: the repo is public with no licence file. Add one if you want others to reuse it (e.g. MIT).
- [ ] **App name**: "RoupiTrip" is a working name.

## 5. Watch the daily job

- [ ] Check the Actions tab over the next few weekdays (runs at 06:00 UTC / 10:00 Mauritius). Each run should either commit "Update exchange rates YYYY-MM-DD" and deploy, or log "Rates unchanged."
- [ ] Make sure GitHub emails you on failure: Settings → Notifications → Actions → "Send notifications for failed workflows only".

## 6. Phase 2 (not started)

- [ ] Trip spending log totalled in Rs: add a storage key in `src/lib/store.ts`, a "Log it" button on the breakdown sheet, and a list screen.
- [ ] Home-screen quick view: add `shortcuts` to `public/manifest.webmanifest` (e.g. straight to `#/convert`).
- [ ] More languages: add `src/i18n/<lang>.ts` with the same keys as `en.ts`.
