// Lazy-loaded Tesseract worker. Assets are self-hosted under /tesseract so the
// service worker can cache them for offline use; nothing is fetched from a CDN.
import type { Worker } from 'tesseract.js';
import type { OcrWord } from '../lib/ocrPrices';

let workerPromise: Promise<Worker> | undefined;

export type Progress = (fraction: number) => void;

export function loadOcr(onProgress?: Progress): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}tesseract/`, location.href).href;
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status?.startsWith('loading') || m.status?.startsWith('initializ')) onProgress?.(m.progress ?? 0);
        },
      });
      // Sparse text suits price tags and menus: prices are found wherever they sit.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })();
    workerPromise.catch(() => (workerPromise = undefined));
  }
  return workerPromise;
}

/** Recognises a canvas and returns its lines as word lists. */
export async function readLines(canvas: HTMLCanvasElement): Promise<OcrWord[][]> {
  const worker = await loadOcr();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const lines: OcrWord[][] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        lines.push(line.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })));
      }
    }
  }
  return lines;
}
