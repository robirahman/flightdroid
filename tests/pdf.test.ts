import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { pdfToText, usePdfJs } from '../src/parse/pdf';

beforeAll(() => usePdfJs(pdfjs as never));

describe('pdfToText', () => {
  it('keeps each table row on one line', async () => {
    const text = await pdfToText(new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'eticket.pdf'))));
    expect(text).toMatch(/BA 2662[^\n]*12OCT23[^\n]*LGW[^\n]*RAK[^\n]*08:15[^\n]*11:45/);
    expect(text).toMatch(/BA 2663[^\n]*19OCT23[^\n]*RAK[^\n]*LGW[^\n]*12:45[^\n]*16:20/);
  });
});
