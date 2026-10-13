/** Browser-only Google OAuth via Google Identity Services. The access token lives in memory only. */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | undefined;
let token: { value: string; expires: number } | undefined;

/** Loads Google's sign-in script ahead of time so the consent popup opens straight from the tap. */
export function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined;
      reject(new Error('Could not load Google sign-in. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function hasToken(): boolean {
  return !!token && token.expires > Date.now() + 60_000;
}

/** Returns a valid access token, showing Google's consent popup if needed. Must start from a user gesture. */
export async function getAccessToken(clientId: string, interactive = true): Promise<string> {
  if (hasToken()) return token!.value;
  if (!clientId) throw new Error('Add your Google OAuth client ID in Settings first.');
  if (!interactive) throw new Error('Gmail session expired. Tap Sync to sign in again.');
  await loadScript();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Sign-in failed'));
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled.' : e.message || e.type)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value);
  token = undefined;
}
