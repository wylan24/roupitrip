// Turns OCR lines (words + boxes) into located prices.
import { findPrices, type PriceMatch } from './parsePrice';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: Box;
}

export interface LocatedPrice extends PriceMatch {
  bbox: Box;
  confidence: number;
}

const MIN_CONFIDENCE = 55;

/** Joins a line's words with single spaces and finds prices, keeping each price's box. */
export function pricesInLine(words: OcrWord[], trip: string): LocatedPrice[] {
  const spans: { start: number; end: number; word: OcrWord }[] = [];
  let text = '';
  for (const word of words) {
    const w = word.text.trim();
    if (!w) continue;
    if (text) text += ' ';
    spans.push({ start: text.length, end: text.length + w.length, word });
    text += w;
  }

  const out: LocatedPrice[] = [];
  for (const m of findPrices(text, { trip })) {
    const hit = spans.filter((s) => s.start < m.index + m.length && s.end > m.index);
    if (!hit.length) continue;
    const confidence = Math.min(...hit.map((s) => s.word.confidence));
    if (confidence < MIN_CONFIDENCE) continue;
    out.push({
      ...m,
      confidence,
      bbox: {
        x0: Math.min(...hit.map((s) => s.word.bbox.x0)),
        y0: Math.min(...hit.map((s) => s.word.bbox.y0)),
        x1: Math.max(...hit.map((s) => s.word.bbox.x1)),
        y1: Math.max(...hit.map((s) => s.word.bbox.y1)),
      },
    });
  }
  return out;
}
