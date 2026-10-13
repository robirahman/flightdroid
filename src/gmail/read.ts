import type { EmailMessage } from '../lib/types';
import { explainEmail, explainText, pdfCandidates, type EmailExplanation } from '../parse';
import { confirmationCode, foldAccents } from '../parse/heuristic';
import { pdfToText } from '../parse/pdf';
import { getAttachment, GmailError, getMessage } from './api';

export interface ReadEmail {
  email: EmailMessage;
  explanation: EmailExplanation;
}

/**
 * Fetches an email and extracts its flights. When the body yields none, PDF attachments
 * (e-tickets, itineraries) are downloaded and read too.
 */
export async function readEmail(token: string, id: string): Promise<ReadEmail> {
  const email = await getMessage(token, id);
  const fromBody = explainEmail(email);
  if (fromBody.flights.length) return { email, explanation: fromBody };

  const texts = fromBody.text ? [fromBody.text] : [];
  let lastReason = fromBody.reason;
  for (const pdf of pdfCandidates(email)) {
    let text: string;
    try {
      text = await pdfToText(await getAttachment(token, id, pdf.id!));
    } catch (e) {
      if (e instanceof GmailError && (e.rateLimited || e.status === 401)) throw e;
      lastReason = `Could not read ${pdf.name} (${e instanceof Error ? e.message : 'unreadable PDF'}).`;
      continue;
    }
    texts.push(`--- ${pdf.name} ---\n${text}`);
    const fromPdf = explainText(text, email, pdf.name);
    if (fromPdf.flights.length) {
      // Receipts often leave the booking code out of the PDF but print it in the email.
      const code = confirmationCode(foldAccents(`${email.subject}\n${fromBody.text ?? ''}`));
      const flights = fromPdf.flights.map((f) => ({ ...f, confirmation: f.confirmation ?? code }));
      return { email, explanation: { ...fromPdf, flights, text: texts.join('\n\n') } };
    }
    lastReason = text ? fromPdf.reason : `${pdf.name} has no text (it may be a scanned image).`;
  }
  return { email, explanation: { ...fromBody, reason: lastReason, text: texts.join('\n\n') } };
}
