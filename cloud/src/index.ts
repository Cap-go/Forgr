import { fetchJwks, formatInvite, issueSession, parseInvite, randomCode, readSession, userIdFor, verifyIdToken } from './auth';
import { HttpError, type DocOp } from './docs';
import { invokeFunction, validateFunction, versionOf } from './functions';
import type { Env, RpcResult } from './objects';

export { SharedSpace, UserSpace } from './objects';
export { UserBinding } from './functions';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

function fail(status: number, error: string): Response {
  return json({ error }, status);
}

function unwrap<T>(r: RpcResult<T>): Response {
  return r.ok ? json({ result: r.value }) : fail(r.status, r.error);
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

const user = (env: Env, userId: string) => env.USER.get(env.USER.idFromName(userId));
const space = (env: Env, spaceId: string) => env.SPACE.get(env.SPACE.idFromName(spaceId));

function displayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 40) : '';
  return name || 'Mapp user';
}

function inviteUrl(env: Env, code: string): string {
  return `${env.PUBLIC_URL}/join/${code}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'mapp-cloud' });
      if (path.startsWith('/join/')) return joinPage(env, decodeURIComponent(path.slice(6)));

      // Public URL of a user function: /u/<userId>/<name>/...
      const pub = path.match(/^\/u\/([a-f0-9]{24})\/([a-z0-9-]{1,40})(\/.*)?$/);
      if (pub) {
        const stub = user(env, pub[1]);
        const fn = await stub.getFunction(pub[2]);
        if (!fn?.code) return fail(404, 'Function not found');
        if (!fn.public) {
          const t = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
          if ((await readSession(env.SESSION_SECRET, t)) !== pub[1]) return fail(401, 'This function is private');
        }
        const res = await invokeFunction(env, ctx, pub[1], { name: fn.name, code: fn.code, version: fn.version }, await stub.secrets(), request);
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      }

      if (path === '/v1/session' && request.method === 'POST') {
        const { idToken } = await body<{ idToken?: string }>(request);
        if (!idToken) return fail(400, 'idToken required');
        const claims = await verifyIdToken(idToken, env.OPENAI_ISSUER, await fetchJwks(env.OPENAI_JWKS_URL)).catch((e: Error) => {
          throw new Response(JSON.stringify({ error: e.message }), { status: 401, headers: { 'content-type': 'application/json', ...CORS } });
        });
        const userId = await userIdFor(claims.iss, claims.sub);
        return json({ userId, ...(await issueSession(env.SESSION_SECRET, userId)) });
      }

      // Everything below needs a session. WebSockets pass it as ?token=.
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
      const userId = token ? await readSession(env.SESSION_SECRET, token) : null;
      if (!userId) return fail(401, 'Sign in again');

      if (path === '/v1/me' && request.method === 'GET') {
        const stub = user(env, userId);
        return json({ result: { userId, usage: await stub.usage(), spaces: await stub.listSpaces() } });
      }

      if (path === '/v1/functions' && request.method === 'GET') {
        const stub = user(env, userId);
        return json({ result: { functions: await stub.listFunctions(), secrets: await stub.secretNames(), baseUrl: `${env.PUBLIC_URL}/u/${userId}/` } });
      }
      let m = path.match(/^\/v1\/functions\/([a-z0-9-]{1,40})(\/run)?$/);
      if (m) {
        const stub = user(env, userId);
        const name = m[1];
        if (m[2] && request.method === 'POST') {
          const fn = await stub.getFunction(name);
          if (!fn?.code) return fail(404, 'Function not found');
          const input = await request.text();
          const res = await invokeFunction(env, ctx, userId, { name, code: fn.code, version: fn.version }, await stub.secrets(),
            new Request(`${env.PUBLIC_URL}/u/${userId}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input || '{}' }));
          const text = await res.text();
          let data: unknown = text;
          try { data = JSON.parse(text); } catch { /* text */ }
          return json({ result: { status: res.status, data } });
        }
        if (request.method === 'GET') {
          const fn = await stub.getFunction(name);
          return fn ? json({ result: fn }) : fail(404, 'Function not found');
        }
        if (request.method === 'PUT') {
          const input = await body<{ code?: string; description?: string; public?: boolean }>(request);
          const code = validateFunction(name, input.code);
          const version = await versionOf(code);
          await stub.saveFunction({ name, code, description: String(input.description ?? '').slice(0, 500), public: input.public !== false, version });
          return json({ result: { name, version, url: `${env.PUBLIC_URL}/u/${userId}/${name}` } });
        }
        if (request.method === 'DELETE') {
          await stub.deleteFunction(name);
          return json({ result: true });
        }
      }
      const secret = path.match(/^\/v1\/secrets\/([A-Z][A-Z0-9_]{0,63})$/);
      if (secret && (request.method === 'PUT' || request.method === 'DELETE')) {
        const value = request.method === 'PUT' ? String((await body<{ value?: string }>(request)).value ?? '') : null;
        if (value !== null && (!value || value.length > 4096)) return fail(400, 'value must be 1-4096 chars');
        await user(env, userId).setSecret(secret[1], value);
        return json({ result: true });
      }

      m = path.match(/^\/v1\/apps\/([A-Za-z0-9_-]{1,64})\/docs$/);
      if (m && request.method === 'POST') {
        return unwrap(await user(env, userId).docs(m[1], await body<DocOp>(request)));
      }

      if (path === '/v1/spaces' && request.method === 'GET') {
        return json({ result: await user(env, userId).listSpaces() });
      }
      if (path === '/v1/spaces' && request.method === 'POST') {
        const input = await body<{ name?: string; description?: string; memberName?: string }>(request);
        const spaceId = randomCode(8);
        const secret = randomCode(8);
        const created = await space(env, spaceId).create(spaceId, userId, displayName(input.memberName), String(input.name ?? ''), String(input.description ?? ''), secret);
        if (!created.ok) return fail(created.status, created.error);
        await user(env, userId).addSpace({ spaceId, name: created.value.name, role: 'owner', joinedAt: Date.now() });
        const code = formatInvite(spaceId, secret);
        return json({ result: { space: created.value, code, url: inviteUrl(env, code) } });
      }
      if (path === '/v1/spaces/join' && request.method === 'POST') {
        const input = await body<{ code?: string; memberName?: string }>(request);
        const invite = parseInvite(String(input.code ?? ''));
        if (!invite) return fail(400, 'Invite codes look like ABCD-EFGH-JKLM-NPQR');
        const joined = await space(env, invite.spaceId).join(userId, displayName(input.memberName), invite.secret);
        if (!joined.ok) return fail(joined.status, joined.error);
        await user(env, userId).addSpace({ spaceId: invite.spaceId, name: joined.value.name, role: joined.value.owner === userId ? 'owner' : 'member', joinedAt: Date.now() });
        return json({ result: joined.value });
      }

      m = path.match(/^\/v1\/spaces\/([A-Z0-9]{8})(\/.*)?$/);
      if (m) {
        const spaceId = m[1];
        const rest = m[2] ?? '';
        const stub = space(env, spaceId);
        if (rest === '' && request.method === 'GET') return unwrap(await stub.getInfo(userId));
        if (rest === '' && request.method === 'PATCH') {
          const r = await stub.update(userId, await body(request));
          if (r.ok) await user(env, userId).addSpace({ spaceId, name: r.value.name, role: 'owner', joinedAt: Date.now() });
          return unwrap(r);
        }
        if (rest === '' && request.method === 'DELETE') {
          const r = await stub.deleteSpace(userId);
          if (!r.ok) return fail(r.status, r.error);
          await Promise.all(r.value.map((member) => user(env, member).removeSpace(spaceId)));
          return json({ result: true });
        }
        if (rest === '/docs' && request.method === 'POST') return unwrap(await stub.docs(userId, await body<DocOp>(request)));
        if (rest === '/code' && request.method === 'GET') {
          const r = await stub.inviteSecret(userId);
          if (!r.ok) return fail(r.status, r.error);
          const code = formatInvite(spaceId, r.value);
          return json({ result: { code, url: inviteUrl(env, code) } });
        }
        if (rest === '/code' && request.method === 'POST') {
          const secret = randomCode(8);
          const r = await stub.rotateCode(userId, secret);
          if (!r.ok) return fail(r.status, r.error);
          const code = formatInvite(spaceId, secret);
          return json({ result: { code, url: inviteUrl(env, code) } });
        }
        const member = rest.match(/^\/members\/([a-f0-9]{24}|me)$/);
        if (member && request.method === 'DELETE') {
          const target = member[1] === 'me' ? userId : member[1];
          const r = await stub.removeMember(userId, target);
          if (r.ok) await user(env, target).removeSpace(spaceId);
          return unwrap(r);
        }
        if (rest === '/live') {
          const headers = new Headers(request.headers);
          headers.set('x-mapp-user', userId);
          return stub.fetch(new Request(request.url, { headers }));
        }
      }
      return fail(404, 'Not found');
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof HttpError) return fail(error.status, error.message);
      console.error(error);
      return fail(500, error instanceof Error ? error.message : 'Server error');
    }
  },
} satisfies ExportedHandler<Env>;

function joinPage(env: Env, code: string): Response {
  const safe = code.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Join a shared space on Mapp</title>
<style>
:root{color-scheme:light dark;--bg:#f2f2f7;--card:#fff;--label:#000;--sec:rgba(60,60,67,.6);--accent:#6e56f7}
@media(prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--label:#fff;--sec:rgba(235,235,245,.6)}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--label);font:17px -apple-system,system-ui,sans-serif;padding:24px;box-sizing:border-box}
.card{background:var(--card);border-radius:20px;padding:28px 24px;max-width:380px;width:100%;text-align:center}
h1{font-size:24px;margin:0 0 8px}p{color:var(--sec);margin:0 0 20px;line-height:1.4}
.code{font:600 22px ui-monospace,SFMono-Regular,monospace;letter-spacing:.06em;padding:14px;border-radius:12px;background:var(--bg);margin-bottom:20px}
a.btn{display:block;padding:15px;border-radius:14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;margin-bottom:10px}
a.plain{color:var(--accent);text-decoration:none;font-size:15px}
</style></head><body><div class="card">
<h1>You're invited</h1>
<p>Someone shared data with you on Mapp. Open Mapp and enter this code, or ask the builder to "join space ${safe}".</p>
<div class="code">${safe}</div>
<a class="btn" href="mapp://join?code=${safe}">Open in Mapp</a>
<a class="plain" href="${env.BETA_URL}">Don't have Mapp yet?</a>
</div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
