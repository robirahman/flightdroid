import type { EmailExplanation } from '../parse';
import { listMessageIds } from './api';
import { syncQueries } from './query';
import { readEmail } from './read';

export interface DiagnosedEmail {
  id: string;
  subject: string;
  from: string;
  date: number;
  /** Whether the sync's own searches would read this email at all. */
  searchedBySync: boolean;
  explanation: EmailExplanation;
}

/**
 * For "why wasn't my flight found?": reads the emails matching the user's search and reports,
 * for each, whether the sync searches include it and what the parser makes of it.
 */
export async function diagnoseSearch(token: string, syncQuery: string, userQuery: string, limit = 10): Promise<DiagnosedEmail[]> {
  const ids = await listMessageIds(token, userQuery, undefined, limit);
  const searched = new Set<string>();
  for (const q of syncQueries(syncQuery)) {
    for (const id of await listMessageIds(token, `(${q}) (${userQuery})`, undefined, 500)) searched.add(id);
  }
  const out: DiagnosedEmail[] = [];
  for (const id of ids) {
    const { email, explanation } = await readEmail(token, id);
    out.push({ id, subject: email.subject, from: email.from, date: email.date, searchedBySync: searched.has(id), explanation });
  }
  return out;
}
