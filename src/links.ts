/** Deep links: mapp://<action>?… and https://<site>/l/<action>?… (universal links). */

export const LINK_HOST = 'mapp-site.digitalshift-ee.workers.dev';

export type LinkAction =
  | { action: 'build'; prompt: string; name?: string }
  | { action: 'open'; app: string }
  | { action: 'edit'; app: string; prompt?: string }
  | { action: 'join'; code: string }
  | { action: 'home' };

const MAX_PROMPT = 4000;

function clean(value: string | null, max = 200): string | undefined {
  const text = value?.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  return text ? text.slice(0, max) : undefined;
}

export function parseLink(url: string): LinkAction | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let action: string;
  if (parsed.protocol === 'mapp:') {
    // mapp://build?… parses with host "build"; mapp:build?… with pathname "build".
    action = (parsed.host || parsed.pathname.replace(/^\/+/, '')).split('/')[0];
  } else if (parsed.protocol === 'https:' && parsed.host === LINK_HOST && parsed.pathname.startsWith('/l/')) {
    action = parsed.pathname.slice(3).replace(/\.html$/, '').split('/')[0];
  } else {
    return null;
  }
  const q = parsed.searchParams;
  switch (action.toLowerCase()) {
    case 'build':
    case 'new': {
      const prompt = clean(q.get('prompt') ?? q.get('q'), MAX_PROMPT);
      return prompt ? { action: 'build', prompt, name: clean(q.get('name'), 40) } : null;
    }
    case 'open': {
      const app = clean(q.get('app'));
      return app ? { action: 'open', app } : null;
    }
    case 'edit': {
      const app = clean(q.get('app'));
      return app ? { action: 'edit', app, prompt: clean(q.get('prompt') ?? q.get('q'), MAX_PROMPT) } : null;
    }
    case 'join': {
      const code = clean(q.get('code'), 32);
      return code ? { action: 'join', code } : null;
    }
    case '':
    case 'home':
      return { action: 'home' };
    default:
      return null;
  }
}

/** Builds a shareable universal link (opens Mapp when installed, the website otherwise). */
export function buildLink(action: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `https://${LINK_HOST}/l/${action}${query ? `?${query}` : ''}`;
}

/** Tools an auto-started link run may use: it can create a new app, nothing else. */
export const LINK_SAFE_TOOLS = new Set(['create_app', 'read_app', 'edit_app', 'write_app', 'get_app_logs', 'list_skills', 'read_skill', 'ask_user']);
