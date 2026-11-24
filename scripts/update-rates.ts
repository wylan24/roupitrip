// Daily job: fetch BoM consolidated indicative rates + market fallback, validate,
// and write public/rates.json. Exits non-zero (keeping the old file) on any problem.
//
//   npm run rates                 # fetch live and write public/rates.json
//   npm run rates -- --dry-run    # fetch and validate, don't write
//   npm run rates -- --bom-html page.html --market-json rates.json
//                                 # use saved responses instead of fetching (e.g. behind a TLS-inspecting proxy)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BOM_URL, parseBomConsolidated } from '../pipeline/bom';
import { buildRates, ratesChanged, validateRates } from '../pipeline/build';
import { MARKET_URL, parseMarket, type MarketResult } from '../pipeline/market';
import type { RatesFile } from '../src/lib/rates';

const OUT = 'public/rates.json';
const USER_AGENT = 'RoupiTrip-rates/1.0 (+https://github.com/wylan24/roupitrip; one request per weekday)';

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res;
}

/** Checks bom.mu/robots.txt still allows our path (it did when this was written). */
async function assertRobotsAllow(path: string) {
  const txt = await (await get('https://www.bom.mu/robots.txt')).text();
  let applies = false;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [k, ...v] = line.split(':');
    const val = v.join(':').trim();
    if (/^user-agent$/i.test(k)) applies = val === '*' || /roupitrip/i.test(val);
    else if (applies && /^disallow$/i.test(k) && val && path.startsWith(val)) {
      throw new Error(`robots.txt disallows ${path} (rule "${val}")`);
    }
  }
}

async function main() {
  const { values: args } = parseArgs({
    options: { 'dry-run': { type: 'boolean' }, 'bom-html': { type: 'string' }, 'market-json': { type: 'string' } },
  });
  const dryRun = args['dry-run'];
  const previous: RatesFile | undefined = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : undefined;

  let bomHtml: string;
  if (args['bom-html']) {
    bomHtml = readFileSync(args['bom-html'], 'utf8');
  } else {
    await assertRobotsAllow(new URL(BOM_URL).pathname);
    bomHtml = await (await get(BOM_URL)).text();
  }
  const bom = parseBomConsolidated(bomHtml);
  console.log(`BoM: ${bom.rows.length} rows dated ${bom.date}`);

  let market: MarketResult | undefined;
  try {
    const json = args['market-json']
      ? JSON.parse(readFileSync(args['market-json'], 'utf8'))
      : await (await get(MARKET_URL)).json();
    market = parseMarket(json);
    console.log(`Market: ${Object.keys(market.mid).length} currencies dated ${market.date}`);
  } catch (err) {
    // BoM alone is still useful; the app simply offers fewer currencies today.
    console.warn(`Market fallback unavailable: ${(err as Error).message}`);
  }

  const next = buildRates(bom, market);
  validateRates(next, previous);

  if (!ratesChanged(next, previous)) {
    console.log('No change in rates; leaving file untouched.');
    return;
  }
  if (dryRun) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n');
  console.log(`Wrote ${OUT} with ${Object.keys(next.rates).length} currencies.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
