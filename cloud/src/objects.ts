import { DurableObject } from 'cloudflare:workers';
import { sha256Hex, timingSafeEqual } from './auth';
import { HttpError, initDocs, runDocOp, type DocOp } from './docs';

export interface Env {
  LOADER: WorkerLoader;
  USER: DurableObjectNamespace<UserSpace>;
  SPACE: DurableObjectNamespace<SharedSpace>;
  SESSION_SECRET: string;
  OPENAI_ISSUER: string;
  OPENAI_JWKS_URL: string;
  PUBLIC_URL: string;
  BETA_URL: string;
}

export interface SpaceMembership {
  spaceId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: number;
}

/** Errors cross the RPC boundary as plain objects so status codes survive. */
export type RpcResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

function wrap<T>(fn: () => T): RpcResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, status: error.status, error: error.message };
    return { ok: false, status: 500, error: error instanceof Error ? error.message : String(error) };
  }
}

/** One per Mapp user: private documents for every app and the list of spaces. */
export class UserSpace extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    initDocs(this.sql);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS spaces (
      space_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS functions (
      name TEXT PRIMARY KEY, code TEXT NOT NULL, description TEXT NOT NULL, public INTEGER NOT NULL,
      version TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  saveFunction(fn: { name: string; code: string; description: string; public: boolean; version: string }): void {
    this.sql.exec(
      `INSERT INTO functions (name, code, description, public, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET code = excluded.code, description = excluded.description, public = excluded.public,
       version = excluded.version, updated_at = excluded.updated_at`,
      fn.name, fn.code, fn.description, fn.public ? 1 : 0, fn.version, Date.now(),
    );
  }

  getFunction(name: string): UserFunction | null {
    const rows = this.sql.exec('SELECT * FROM functions WHERE name = ?', name).toArray();
    return rows.length ? toFunction(rows[0], true) : null;
  }

  listFunctions(): UserFunction[] {
    return this.sql.exec('SELECT * FROM functions ORDER BY name').toArray().map((r) => toFunction(r, false));
  }

  deleteFunction(name: string): void {
    this.sql.exec('DELETE FROM functions WHERE name = ?', name);
  }

  setSecret(name: string, value: string | null): void {
    if (value === null) this.sql.exec('DELETE FROM secrets WHERE name = ?', name);
    else this.sql.exec('INSERT INTO secrets (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value', name, value);
  }

  secretNames(): string[] {
    return this.sql.exec('SELECT name FROM secrets ORDER BY name').toArray().map((r) => String(r.name));
  }

  secrets(): Record<string, string> {
    return Object.fromEntries(this.sql.exec('SELECT name, value FROM secrets').toArray().map((r) => [String(r.name), String(r.value)]));
  }

  docs(app: string, op: DocOp): RpcResult<unknown> {
    return wrap(() => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(app)) throw new HttpError(400, 'Invalid app id');
      return runDocOp(this.sql, app, op).result;
    });
  }

  addSpace(m: SpaceMembership): void {
    this.sql.exec(
      'INSERT INTO spaces (space_id, name, role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT (space_id) DO UPDATE SET name = excluded.name, role = excluded.role',
      m.spaceId, m.name, m.role, m.joinedAt,
    );
  }

  removeSpace(spaceId: string): void {
    this.sql.exec('DELETE FROM spaces WHERE space_id = ?', spaceId);
  }

  listSpaces(): SpaceMembership[] {
    return this.sql.exec('SELECT * FROM spaces ORDER BY joined_at DESC').toArray().map((r) => ({
      spaceId: String(r.space_id),
      name: String(r.name),
      role: String(r.role) as SpaceMembership['role'],
      joinedAt: Number(r.joined_at),
    }));
  }

  usage(): { docs: number; bytes: number } {
    const row = this.sql.exec('SELECT COUNT(*) AS docs, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM docs').one();
    return { docs: Number(row.docs), bytes: Number(row.bytes) };
  }
}

export interface UserFunction {
  name: string;
  description: string;
  public: boolean;
  version: string;
  updatedAt: number;
  code?: string;
}

function toFunction(r: Record<string, SqlStorageValue>, withCode: boolean): UserFunction {
  return {
    name: String(r.name),
    description: String(r.description),
    public: Number(r.public) === 1,
    version: String(r.version),
    updatedAt: Number(r.updated_at),
    ...(withCode ? { code: String(r.code) } : {}),
  };
}

export interface SpaceInfo {
  spaceId: string;
  name: string;
  description: string;
  owner: string;
  createdAt: number;
  members: Array<{ userId: string; name: string; role: 'owner' | 'member'; joinedAt: number }>;
}

const MAX_MEMBERS = 50;

/**
 * A shared, isolated data space. Members join with an invite code; every
 * member's apps can read and write its collections. Live changes are pushed
 * over hibernating WebSockets.
 */
export class SharedSpace extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    initDocs(this.sql);
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS members (
      user_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL
    )`);
  }

  private meta(key: string): string | null {
    const rows = this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray();
    return rows.length ? String(rows[0].value) : null;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
  }

  private role(userId: string): 'owner' | 'member' | null {
    const rows = this.sql.exec('SELECT role FROM members WHERE user_id = ?', userId).toArray();
    return rows.length ? (String(rows[0].role) as 'owner' | 'member') : null;
  }

  private requireMember(userId: string): 'owner' | 'member' {
    const role = this.role(userId);
    if (!role) throw new HttpError(403, 'Not a member of this space');
    return role;
  }

  async create(spaceId: string, owner: string, ownerName: string, name: string, description: string, secret: string): Promise<RpcResult<SpaceInfo>> {
    if (this.meta('spaceId')) return { ok: false, status: 409, error: 'Space already exists' };
    this.setMeta('spaceId', spaceId);
    this.setMeta('name', name.slice(0, 60) || 'Shared space');
    this.setMeta('description', description.slice(0, 2000));
    this.setMeta('owner', owner);
    this.setMeta('createdAt', String(Date.now()));
    this.setMeta('secretHash', await sha256Hex(secret));
    this.setMeta('secret', secret);
    this.sql.exec('INSERT INTO members (user_id, name, role, joined_at) VALUES (?, ?, ?, ?)', owner, ownerName, 'owner', Date.now());
    return { ok: true, value: this.info() };
  }

  async join(userId: string, userName: string, secret: string): Promise<RpcResult<SpaceInfo>> {
    if (!this.meta('spaceId')) return { ok: false, status: 404, error: 'Invite code not found' };
    if (this.role(userId)) return { ok: true, value: this.info() };
    // Slow down guessing: at most 10 bad attempts per hour per space.
    const failures = JSON.parse(this.meta('failures') ?? '[]') as number[];
    const recent = failures.filter((t) => t > Date.now() - 3_600_000);
    if (recent.length >= 10) return { ok: false, status: 429, error: 'Too many attempts, try again later' };
    if (!timingSafeEqual(await sha256Hex(secret), this.meta('secretHash') ?? '')) {
      this.setMeta('failures', JSON.stringify([...recent, Date.now()]));
      return { ok: false, status: 404, error: 'Invite code not found' };
    }
    const count = Number(this.sql.exec('SELECT COUNT(*) AS n FROM members').one().n);
    if (count >= MAX_MEMBERS) return { ok: false, status: 403, error: 'This space is full' };
    this.sql.exec('INSERT INTO members (user_id, name, role, joined_at) VALUES (?, ?, ?, ?)', userId, userName, 'member', Date.now());
    this.broadcast({ type: 'member', op: 'join', name: userName });
    return { ok: true, value: this.info() };
  }

  info(): SpaceInfo {
    return {
      spaceId: this.meta('spaceId') ?? '',
      name: this.meta('name') ?? '',
      description: this.meta('description') ?? '',
      owner: this.meta('owner') ?? '',
      createdAt: Number(this.meta('createdAt') ?? 0),
      members: this.sql.exec('SELECT * FROM members ORDER BY joined_at').toArray().map((r) => ({
        userId: String(r.user_id),
        name: String(r.name),
        role: String(r.role) as 'owner' | 'member',
        joinedAt: Number(r.joined_at),
      })),
    };
  }

  getInfo(userId: string): RpcResult<SpaceInfo> {
    return wrap(() => {
      this.requireMember(userId);
      return this.info();
    });
  }

  docs(userId: string, op: DocOp): RpcResult<unknown> {
    return wrap(() => {
      this.requireMember(userId);
      const { result, changed } = runDocOp(this.sql, '', op, userId);
      if (changed) this.broadcast({ type: 'change', ...changed, by: userId });
      return result;
    });
  }

  update(userId: string, patch: { name?: string; description?: string }): RpcResult<SpaceInfo> {
    return wrap(() => {
      if (this.requireMember(userId) !== 'owner') throw new HttpError(403, 'Only the owner can change the space');
      if (patch.name) this.setMeta('name', patch.name.slice(0, 60));
      if (patch.description !== undefined) this.setMeta('description', patch.description.slice(0, 2000));
      return this.info();
    });
  }

  async rotateCode(userId: string, secret: string): Promise<RpcResult<true>> {
    if (this.role(userId) !== 'owner') return { ok: false, status: 403, error: 'Only the owner can create a new code' };
    this.setMeta('secretHash', await sha256Hex(secret));
    this.setMeta('secret', secret);
    return { ok: true, value: true };
  }

  /** Owner reads the current invite secret to share it again. */
  inviteSecret(userId: string): RpcResult<string> {
    return wrap(() => {
      if (this.requireMember(userId) !== 'owner') throw new HttpError(403, 'Only the owner can share the invite code');
      return this.meta('secret') ?? '';
    });
  }

  /** Member leaves, or owner removes someone. Returns the removed user id. */
  removeMember(userId: string, target: string): RpcResult<string> {
    return wrap(() => {
      const role = this.requireMember(userId);
      if (target !== userId && role !== 'owner') throw new HttpError(403, 'Only the owner can remove members');
      if (this.role(target) === 'owner') throw new HttpError(400, 'The owner cannot leave; delete the space instead');
      this.sql.exec('DELETE FROM members WHERE user_id = ?', target);
      for (const ws of this.ctx.getWebSockets(target)) ws.close(4003, 'Removed from space');
      this.broadcast({ type: 'member', op: 'leave', userId: target });
      return target;
    });
  }

  async deleteSpace(userId: string): Promise<RpcResult<string[]>> {
    if (this.role(userId) !== 'owner') return { ok: false, status: 403, error: 'Only the owner can delete the space' };
    const members = this.info().members.map((m) => m.userId);
    for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'Space deleted');
    await this.ctx.storage.deleteAll();
    return { ok: true, value: members };
  }

  async fetch(request: Request): Promise<Response> {
    // Upgrade already authenticated by the Worker, which passes the user id.
    const userId = request.headers.get('x-mapp-user') ?? '';
    if (!this.role(userId)) return new Response('Not a member', { status: 403 });
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [userId]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') ws.send('pong');
  }

  private broadcast(event: Record<string, unknown>): void {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* closed */ }
    }
  }
}
