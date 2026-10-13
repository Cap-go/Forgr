import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { session } from '../ai/session';
import { secureGet, secureRemove, secureSet } from '../auth/secure-storage';

export const CLOUD_URL = 'https://mapp-cloud.digitalshift-ee.workers.dev';
const TOKEN_KEY = 'mapp_cloud_session_v1';

interface CloudSession {
  token: string;
  userId: string;
  expiresAt: number;
  subject: string;
}

export interface DocOp {
  op: 'put' | 'get' | 'list' | 'delete' | 'clear' | 'collections';
  collection?: string;
  id?: string;
  data?: unknown;
  where?: Record<string, string | number | boolean | null>;
  order?: string;
  limit?: number;
  offset?: number;
}

export interface SpaceSummary {
  spaceId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface SpaceInfo {
  spaceId: string;
  name: string;
  description: string;
  owner: string;
  createdAt: number;
  members: Array<{ userId: string; name: string; role: string; joinedAt: number }>;
}

export class CloudError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({ url: CLOUD_URL + path, method, headers, data: body, responseType: 'json' });
    return { status: res.status, data: (typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data ?? {}) as Record<string, unknown> };
  }
  const res = await fetch(CLOUD_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Forgr Cloud: a private database per user and shared spaces between users. */
class CloudClient {
  private current: CloudSession | null = null;
  private pending: Promise<CloudSession> | null = null;

  private async session(force = false): Promise<CloudSession> {
    const creds = session.credentials;
    if (!creds) throw new CloudError(401, 'Sign in with ChatGPT to use Forgr Cloud.');
    if (!force && !this.current) {
      const raw = await secureGet(TOKEN_KEY).catch(() => null);
      if (raw) this.current = JSON.parse(raw) as CloudSession;
    }
    const valid = this.current && this.current.subject === creds.subject && this.current.expiresAt > Date.now() + 86_400_000;
    if (!force && valid && this.current) return this.current;
    this.pending ??= (async () => {
      const idToken = await session.freshIdToken();
      const res = await request('POST', '/v1/session', undefined, { idToken });
      if (res.status !== 200) throw new CloudError(res.status, String(res.data.error ?? 'Could not connect to Forgr Cloud'));
      const next: CloudSession = {
        token: String(res.data.token),
        userId: String(res.data.userId),
        expiresAt: Number(res.data.expiresAt),
        subject: creds.subject,
      };
      this.current = next;
      await secureSet(TOKEN_KEY, JSON.stringify(next));
      return next;
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await request(method, path, (await this.session()).token, body);
    if (res.status === 401) res = await request(method, path, (await this.session(true)).token, body);
    if (res.status < 200 || res.status >= 300) throw new CloudError(res.status, String(res.data.error ?? `Forgr Cloud error ${res.status}`));
    return res.data.result as T;
  }

  async userId(): Promise<string> {
    return (await this.session()).userId;
  }

  async liveUrl(spaceId: string): Promise<string> {
    const { token } = await this.session();
    return `${CLOUD_URL.replace(/^http/, 'ws')}/v1/spaces/${spaceId}/live?token=${encodeURIComponent(token)}`;
  }

  async signOut(): Promise<void> {
    this.current = null;
    await secureRemove(TOKEN_KEY).catch(() => undefined);
  }

  appDocs(appId: string, op: DocOp): Promise<unknown> {
    return this.call('POST', `/v1/apps/${appId}/docs`, op);
  }

  spaceDocs(spaceId: string, op: DocOp): Promise<unknown> {
    return this.call('POST', `/v1/spaces/${spaceId}/docs`, op);
  }

  listSpaces(): Promise<SpaceSummary[]> {
    return this.call('GET', '/v1/spaces');
  }

  spaceInfo(spaceId: string): Promise<SpaceInfo> {
    return this.call('GET', `/v1/spaces/${spaceId}`);
  }

  createSpace(name: string, description: string, memberName: string): Promise<{ space: SpaceInfo; code: string; url: string }> {
    return this.call('POST', '/v1/spaces', { name, description, memberName });
  }

  joinSpace(code: string, memberName: string): Promise<SpaceInfo> {
    return this.call('POST', '/v1/spaces/join', { code, memberName });
  }

  invite(spaceId: string): Promise<{ code: string; url: string }> {
    return this.call('GET', `/v1/spaces/${spaceId}/code`);
  }

  leaveSpace(spaceId: string): Promise<unknown> {
    return this.call('DELETE', `/v1/spaces/${spaceId}/members/me`);
  }

  updateSpace(spaceId: string, patch: { name?: string; description?: string }): Promise<SpaceInfo> {
    return this.call('PATCH', `/v1/spaces/${spaceId}`, patch);
  }
}

export const cloud = new CloudClient();

/** Display name other members see: first part of the ChatGPT email. */
export function memberName(): string {
  const email = session.credentials?.email ?? '';
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40) : 'Forgr user';
}
