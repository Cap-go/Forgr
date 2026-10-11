import { WorkerEntrypoint } from 'cloudflare:workers';
import { sha256Hex } from './auth';
import { HttpError, type DocOp } from './docs';
import type { Env, RpcResult } from './objects';

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CODE_BYTES = 512 * 1024;

/**
 * The only door from user code back into Mapp: bound to one user, it reaches
 * that user's own data and the spaces they belong to, nothing else.
 */
export class UserBinding extends WorkerEntrypoint<Env, { userId: string }> {
  private get userId(): string {
    return this.ctx.props.userId;
  }

  private async unwrap<T>(r: Promise<RpcResult<T>>): Promise<T> {
    const res = await r;
    if (!res.ok) throw new Error(res.error);
    return res.value;
  }

  docs(app: string, op: DocOp): Promise<unknown> {
    return this.unwrap(this.env.USER.get(this.env.USER.idFromName(this.userId)).docs(app, op));
  }

  spaceDocs(spaceId: string, op: DocOp): Promise<unknown> {
    return this.unwrap(this.env.SPACE.get(this.env.SPACE.idFromName(spaceId)).docs(this.userId, op));
  }

  spaces(): Promise<unknown> {
    return this.env.USER.get(this.env.USER.idFromName(this.userId)).listSpaces();
  }
}

export function validateFunction(name: string, code: unknown): string {
  if (!NAME.test(name)) throw new HttpError(400, 'Function names use lowercase letters, digits and "-", max 40');
  if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, 'code required');
  if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) throw new HttpError(413, 'Code larger than 512 KB');
  if (!/export\s+default/.test(code)) throw new HttpError(400, 'Code must be an ES module with `export default { fetch(request, env) { ... } }`');
  return code;
}

export function versionOf(code: string): Promise<string> {
  return sha256Hex(code).then((h) => h.slice(0, 16));
}

interface Exports {
  UserBinding(options: { props: { userId: string } }): Fetcher;
}

/** Runs a user's function in its own sandboxed isolate. */
export async function invokeFunction(
  env: Env,
  ctx: ExecutionContext,
  userId: string,
  fn: { name: string; code: string; version: string },
  secrets: Record<string, string>,
  request: Request,
): Promise<Response> {
  const exports = (ctx as unknown as { exports: Exports }).exports;
  const worker = env.LOADER.get(`${userId}:${fn.name}:${fn.version}:${await sha256Hex(JSON.stringify(secrets))}`, () => ({
    compatibilityDate: '2026-10-01',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: 'index.js',
    modules: { 'index.js': fn.code },
    env: { ...secrets, USER_ID: userId, MAPP: exports.UserBinding({ props: { userId } }) },
  }));
  try {
    return await worker.getEntrypoint(undefined, { limits: { cpuMs: 100, subRequests: 50 } }).fetch(request);
  } catch (error) {
    return new Response(JSON.stringify({ error: `Function failed: ${error instanceof Error ? error.message : String(error)}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
