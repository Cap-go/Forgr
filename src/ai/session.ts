import { completeSignIn, refreshAccessToken } from '../auth/oauth';
import { loadLatestCredentials, signOut as clearStoredCredentials } from '../auth/token-store';
import type { OAuthCredentialRecord } from '../auth/types';

type Listener = (creds: OAuthCredentialRecord | null) => void;

/** Holds the ChatGPT sign in and refreshes the access token when needed. */
class Session {
  private creds: OAuthCredentialRecord | null = null;
  private listeners = new Set<Listener>();
  private refreshing: Promise<OAuthCredentialRecord> | null = null;

  get credentials(): OAuthCredentialRecord | null {
    return this.creds;
  }

  get signedIn(): boolean {
    return this.creds !== null;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async restore(): Promise<void> {
    try {
      this.set(await loadLatestCredentials());
    } catch {
      this.set(null);
    }
  }

  async signIn(): Promise<void> {
    this.set(await completeSignIn(this.creds?.clientId ?? null));
  }

  async signOut(): Promise<void> {
    await clearStoredCredentials();
    this.set(null);
  }

  /** Runs fn with a valid access token, refreshing once on expiry or 401. */
  async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    if (!this.creds) throw new Error('Sign in with ChatGPT first.');
    if (Date.now() >= this.creds.expiresAtMs - 60_000) await this.refresh();
    try {
      return await fn(this.creds.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('(401)') && !message.includes('invalid_token')) throw error;
      await this.refresh();
      return fn(this.creds.accessToken);
    }
  }

  private async refresh(): Promise<void> {
    const current = this.creds;
    if (!current) throw new Error('Sign in with ChatGPT first.');
    this.refreshing ??= refreshAccessToken(current).finally(() => {
      this.refreshing = null;
    });
    this.set(await this.refreshing);
  }

  private set(creds: OAuthCredentialRecord | null): void {
    this.creds = creds;
    for (const fn of this.listeners) fn(creds);
  }
}

export const session = new Session();
