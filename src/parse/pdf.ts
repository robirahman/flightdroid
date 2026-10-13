import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { normalizeText } from './html';

type PdfJs = typeof import('pdfjs-dist');

let loader: Promise<PdfJs> | undefined;

/** pdf.js is ~1.7 MB, so it is only downloaded the first time an email needs a PDF read. */
function loadPdfJs(): Promise<PdfJs> {
  loader ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loader;
}

/** Lets tests run pdf.js's Node build instead of the browser bundle. */
export function usePdfJs(lib: PdfJs) {
  loader = Promise.resolve(lib);
}

const MAX_PAGES = 10;

/**
 * Text of a PDF laid out roughly as printed: one line per row of text, with " | " between
 * columns, so ticket tables read like the email tables the text parser already understands.
 */
export async function pdfToText(data: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data, disableFontFace: true });
  const doc = await task.promise;
  try {
    const lines: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((i): i is TextItem => 'str' in i && i.str.trim() !== '');
      // Group text pieces into rows by their baseline, top of the page first.
      const rows: { y: number; items: TextItem[] }[] = [];
      for (const item of items) {
        const y = item.transform[5];
        const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, item.height * 0.4));
        if (row) row.items.push(item);
        else rows.push({ y, items: [item] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) {
        row.items.sort((a, b) => a.transform[4] - b.transform[4]);
        let line = '';
        let lastEnd = -Infinity;
        for (const item of row.items) {
          const x = item.transform[4];
          const gap = x - lastEnd;
          if (line) line += gap > Math.max(4, item.height * 0.5) ? ' | ' : gap > item.height * 0.15 ? ' ' : '';
          line += item.str;
          lastEnd = x + item.width;
        }
        lines.push(line);
      }
      page.cleanup();
    }
    return normalizeText(lines.join('\n'));
  } finally {
    await task.destroy();
  }
}
