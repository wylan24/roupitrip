// Copies the Tesseract worker, LSTM-only WASM cores and English data into
// public/tesseract so OCR is served from our own origin (and can be cached offline).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = 'public/tesseract';
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

const tjs = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

cpSync(join(tjs, 'dist/worker.min.js'), join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(join(core, f), join(out, 'core', f));
}
cpSync(join(eng, '4.0.0_best_int/eng.traineddata.gz'), join(out, 'lang/eng.traineddata.gz'));
console.log('OCR assets copied to', out);
