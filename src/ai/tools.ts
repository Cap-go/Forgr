import { appStore } from '../apps/store';
import { getLogs } from '../apps/bridge';
import { capabilityNames } from '../apps/capabilities';
import { LINK_SAFE_TOOLS } from '../links';
import { looksLikeSecret, normalizeSecretName, SECRET_NAME, type SecretKind } from '../secrets';
import { cloud, memberName } from '../cloud/client';
import { listSkills, readSkill } from '../skills';

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const str = (description: string) => ({ type: 'string', description });

const TOOLS = [
  {
    type: 'function',
    name: 'list_apps',
    description: 'List the user\'s apps (id, name, emoji, description).',
    parameters: obj({}),
  },
  {
    type: 'function',
    name: 'read_app',
    description: 'Read the full HTML source of an app.',
    parameters: obj({ id: str('App id') }, ['id']),
  },
  {
    type: 'function',
    name: 'create_app',
    description: 'Create a new app from a complete single-file HTML document and open it.',
    parameters: obj({
      name: str('Short app name, max 20 chars'),
      emoji: str('One emoji used as the app icon'),
      color: str('Icon background color, hex like #ff7a59'),
      description: str('One sentence about what the app does'),
      html: str('Complete HTML document with inline CSS and JS'),
    }, ['name', 'emoji', 'color', 'description', 'html']),
  },
  {
    type: 'function',
    name: 'write_app',
    description: 'Replace the whole HTML source of an existing app. Prefer edit_app for small changes.',
    parameters: obj({ id: str('App id'), html: str('Complete new HTML document') }, ['id', 'html']),
  },
  {
    type: 'function',
    name: 'edit_app',
    description: 'Apply exact search and replace edits to an app\'s HTML. Each find string must appear exactly once.',
    parameters: obj({
      id: str('App id'),
      edits: {
        type: 'array',
        items: obj({ find: str('Exact existing text'), replace: str('Replacement text') }, ['find', 'replace']),
      },
    }, ['id', 'edits']),
  },
  {
    type: 'function',
    name: 'update_app_info',
    description: 'Change an app\'s name, emoji, icon color or description.',
    parameters: obj({
      id: str('App id'),
      name: str('New name'),
      emoji: str('New emoji'),
      color: str('New hex color'),
      description: str('New description'),
    }, ['id']),
  },
  {
    type: 'function',
    name: 'open_app',
    description: 'Open an app full screen so the user sees it.',
    parameters: obj({ id: str('App id') }, ['id']),
  },
  {
    type: 'function',
    name: 'get_app_logs',
    description: 'Read recent console logs and runtime errors from an app (open it first). Use after changes to verify it runs.',
    parameters: obj({ id: str('App id') }, ['id']),
  },
  {
    type: 'function',
    name: 'list_cloud',
    description: "List the user's Mapp Cloud functions (with public URLs), secret names and shared spaces (with descriptions of their data).",
    parameters: obj({}),
  },
  {
    type: 'function',
    name: 'deploy_function',
    description: 'Create or replace a server function (sandboxed Cloudflare Worker ES module). Returns its URL.',
    parameters: obj({
      name: str('lowercase-with-dashes, max 40'),
      code: str('ES module: export default { async fetch(request, env) { ... } }'),
      description: str('What it does'),
      public: { type: 'boolean', description: 'true = anyone with the URL can call it (webhooks, sharing); false = only the user' },
    }, ['name', 'code', 'description', 'public']),
  },
  {
    type: 'function',
    name: 'delete_function',
    description: 'Delete a server function.',
    parameters: obj({ name: str('Function name') }, ['name']),
  },
  {
    type: 'function',
    name: 'request_secret',
    description: 'Ask the user for an API key, token or password through a secure card. The value goes to the Keychain (target "device", for apps) or the user\'s cloud secrets (target "cloud", for server functions). You never see the value; you only learn whether it was saved.',
    parameters: obj({
      name: str('UPPER_SNAKE_CASE, e.g. STRIPE_SECRET_KEY'),
      label: str('What it is, shown to the user, e.g. "Stripe secret key"'),
      help: str('One short sentence: where to find it or why it is needed'),
      kind: { type: 'string', enum: ['api_key', 'password', 'token', 'text'] },
      username: str('For passwords: the account/username it belongs to (optional)'),
      target: { type: 'string', enum: ['device', 'cloud'], description: 'device = mini apps read it; cloud = server functions read it as env.NAME' },
    }, ['name', 'label', 'help', 'kind', 'target']),
  },
  {
    type: 'function',
    name: 'ask_user',
    description: 'Ask the user one question as a card with suggested answers, a free text answer and Skip. Use only for real decisions you cannot sensibly default. Returns their answer or skipped.',
    parameters: obj({
      question: str('Short question'),
      options: { type: 'array', items: { type: 'string' }, description: '2 to 5 concrete suggested answers' },
      allow_other: { type: 'boolean', description: 'Let the user type their own answer (usually true)' },
      multiple: { type: 'boolean', description: 'Allow choosing several options' },
    }, ['question', 'options', 'allow_other', 'multiple']),
  },
  {
    type: 'function',
    name: 'join_space',
    description: 'Join a shared space with an invite code the user received. Returns its description so you can build an app on it.',
    parameters: obj({ code: str('Invite code like ABCD-EFGH-JKLM-NPQR') }, ['code']),
  },
  {
    type: 'function',
    name: 'list_skills',
    description: 'List Capgo skills: expert guides on mobile UI, safe areas, keyboard, accessibility, performance, offline, Capacitor plugins.',
    parameters: obj({}),
  },
  {
    type: 'function',
    name: 'read_skill',
    description: 'Read one Capgo skill guide by name.',
    parameters: obj({ name: str('Skill name from list_skills') }, ['name']),
  },
];

/** ChatGPT plan usage only accepts function tools grouped in a namespace. */
export const MAPP_TOOL_NAMESPACE = {
  type: 'namespace',
  name: 'mapp',
  description: 'Build and change the user\'s personal mobile apps stored on this phone.',
  tools: TOOLS,
};

export interface ToolContext {
  openApp(id: string): Promise<void>;
  /** Waits briefly so a freshly loaded app can report errors. */
  settle(): Promise<void>;
  /**
   * Set for runs started by an outside link: only LINK_SAFE_TOOLS, and only on
   * apps created in this run, so a crafted prompt cannot read other apps,
   * cloud data or spaces.
   */
  restricted?: { createdIds: Set<string> };
  /** Shows a secure entry card; resolves without the value. */
  requestSecret?(spec: { name: string; label: string; help: string; kind: SecretKind; username?: string; target: 'device' | 'cloud' }): Promise<{ saved: boolean }>;
  /** Shows a question card; resolves with the answer, or null when skipped. */
  askUser?(question: { question: string; options: string[]; allowOther: boolean; multiple: boolean }): Promise<string | null>;
}

/** The tool namespace offered to the model, narrowed for link-started runs. */
export function toolNamespaceFor(ctx: ToolContext): typeof MAPP_TOOL_NAMESPACE {
  if (!ctx.restricted) return MAPP_TOOL_NAMESPACE;
  return { ...MAPP_TOOL_NAMESPACE, tools: MAPP_TOOL_NAMESPACE.tools.filter((t) => LINK_SAFE_TOOLS.has(t.name)) };
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if ('__invalid_json' in args) throw new Error('Tool arguments were not valid JSON. Try again with smaller edits.');
  const id = String(args.id ?? '');
  if (ctx.restricted) {
    if (!LINK_SAFE_TOOLS.has(name)) throw new Error(`${name} is not available for requests started from a link.`);
    if (!['create_app', 'list_skills', 'read_skill', 'ask_user'].includes(name) && !ctx.restricted.createdIds.has(id)) {
      throw new Error('Requests started from a link can only change the app they created.');
    }
  }
  switch (name) {
    case 'list_apps':
      return JSON.stringify((await appStore.load()).map(({ id: appId, name: n, emoji, description }) => ({ id: appId, name: n, emoji, description })));
    case 'read_app':
      return await appStore.readHtml(id);
    case 'create_app': {
      const html = requireHtml(args.html);
      const app = await appStore.create({
        name: String(args.name ?? ''),
        emoji: String(args.emoji ?? ''),
        color: String(args.color ?? ''),
        description: String(args.description ?? ''),
        html,
        origin: ctx.restricted ? 'link' : 'chat',
      });
      ctx.restricted?.createdIds.add(app.id);
      await ctx.openApp(app.id);
      return JSON.stringify({ ok: true, id: app.id, opened: true, logs: await settleLogs(app.id, ctx), warnings: lintHtml(html) });
    }
    case 'write_app': {
      const html = requireHtml(args.html);
      await appStore.writeHtml(id, html);
      await ctx.openApp(id);
      return JSON.stringify({ ok: true, logs: await settleLogs(id, ctx), warnings: lintHtml(html) });
    }
    case 'edit_app': {
      let html = await appStore.readHtml(id);
      const edits = Array.isArray(args.edits) ? (args.edits as Array<{ find?: string; replace?: string }>) : [];
      if (!edits.length) throw new Error('No edits given');
      for (const [i, edit] of edits.entries()) {
        const find = String(edit.find ?? '');
        if (!find) throw new Error(`Edit ${i + 1}: find is empty`);
        const first = html.indexOf(find);
        if (first === -1) throw new Error(`Edit ${i + 1}: find text not found. Read the app again and copy text exactly.`);
        if (html.indexOf(find, first + 1) !== -1) throw new Error(`Edit ${i + 1}: find text appears more than once. Include more context.`);
        html = html.slice(0, first) + String(edit.replace ?? '') + html.slice(first + find.length);
      }
      await appStore.writeHtml(id, html);
      await ctx.openApp(id);
      return JSON.stringify({ ok: true, applied: edits.length, logs: await settleLogs(id, ctx), warnings: lintHtml(html) });
    }
    case 'update_app_info': {
      const app = await appStore.updateInfo(id, {
        name: args.name as string | undefined,
        emoji: args.emoji as string | undefined,
        color: args.color as string | undefined,
        description: args.description as string | undefined,
      });
      return JSON.stringify({ ok: true, app });
    }
    case 'open_app':
      appStore.require(id);
      await ctx.openApp(id);
      return JSON.stringify({ ok: true, logs: await settleLogs(id, ctx) });
    case 'get_app_logs':
      appStore.require(id);
      return JSON.stringify(getLogs(id).slice(-30));
    case 'list_cloud': {
      const [fns, spaces] = await Promise.all([
        cloud.call<{ functions: unknown[]; secrets: string[]; baseUrl: string }>('GET', '/v1/functions'),
        cloud.listSpaces(),
      ]);
      const detailed = await Promise.all(spaces.map((sp) => cloud.spaceInfo(sp.spaceId)
        .then((info) => ({ ...sp, description: info.description, members: info.members.map((m) => m.name) }))
        .catch(() => sp)));
      return JSON.stringify({ ...fns, spaces: detailed });
    }
    case 'deploy_function': {
      const result = await cloud.call('PUT', `/v1/functions/${String(args.name ?? '')}`, {
        code: String(args.code ?? ''),
        description: String(args.description ?? ''),
        public: args.public !== false,
      });
      return JSON.stringify({ ok: true, ...(result as object) });
    }
    case 'delete_function':
      await cloud.call('DELETE', `/v1/functions/${String(args.name ?? '')}`);
      return JSON.stringify({ ok: true });
    case 'request_secret': {
      if (!ctx.requestSecret) throw new Error('Secure entry is not available here.');
      const name = normalizeSecretName(String(args.name ?? ''));
      if (!SECRET_NAME.test(name)) throw new Error('name must be UPPER_SNAKE_CASE');
      const result = await ctx.requestSecret({
        name,
        label: String(args.label ?? name),
        help: String(args.help ?? ''),
        kind: (['api_key', 'password', 'token', 'text'].includes(String(args.kind)) ? args.kind : 'api_key') as SecretKind,
        username: typeof args.username === 'string' && args.username ? args.username : undefined,
        target: args.target === 'cloud' ? 'cloud' : 'device',
      });
      // Only the outcome goes back to the model, never the value.
      return JSON.stringify(result.saved
        ? { saved: true, name, use: args.target === 'cloud' ? `env.${name} in server functions` : `{{secret:${name}}} in mapp.http.fetch, or mapp.secrets.get('${name}')` }
        : { saved: false, name, note: 'The user skipped. Continue without it or explain what it is needed for.' });
    }
    case 'ask_user': {
      if (!ctx.askUser) throw new Error('Questions are not available here.');
      const options = Array.isArray(args.options) ? args.options.map(String).filter(Boolean).slice(0, 6) : [];
      const answer = await ctx.askUser({
        question: String(args.question ?? ''),
        options,
        allowOther: args.allow_other !== false,
        multiple: args.multiple === true,
      });
      return JSON.stringify(answer === null ? { skipped: true } : { answer });
    }
    case 'join_space':
      return JSON.stringify(await cloud.joinSpace(String(args.code ?? ''), memberName()));
    case 'list_skills':
      return JSON.stringify(listSkills());
    case 'read_skill':
      return readSkill(String(args.name ?? ''));
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function requireHtml(value: unknown): string {
  const html = String(value ?? '');
  if (html.trim().length < 20) throw new Error('html is empty. Send the complete HTML document.');
  return html;
}

/** Logs are cleared whenever an app (re)loads, so these are fresh. */
async function settleLogs(id: string, ctx: ToolContext): Promise<unknown> {
  await ctx.settle();
  const errors = getLogs(id).filter((l) => l.level === 'error');
  return errors.length ? errors.slice(-10) : 'no errors';
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/, 'Browser storage is blocked in the sandbox: use mapp.storage.'],
  [/navigator\.geolocation/, 'navigator.geolocation does not work: use mapp.location.'],
  [/getUserMedia|<input[^>]+capture=/, 'Camera/microphone web APIs do not work: use the mapp camera/audio capabilities.'],
  [/navigator\.vibrate/, 'navigator.vibrate does nothing on iPhone: use mapp.haptics.'],
  [/\bnew Notification\(|Notification\.requestPermission/, 'Notification API does not work: use mapp.notifications.'],
  [/\bwindow\.open\(/, 'window.open is blocked: use mapp.app.openUrl.'],
  [/\b(alert|confirm|prompt)\(/, 'Avoid alert/confirm/prompt: use the kit sheet or inline UI.'],
  [/100vh/, 'Use 100dvh instead of 100vh so the keyboard does not cover content.'],
  [/SpeechRecognition|speechSynthesis/, 'Web Speech API does not work: use the mapp speech capabilities.'],
];

/** Static checks so the model notices unsupported APIs before telling the user it works. */
export function lintHtml(html: string): string[] | 'none' {
  const known = new Set(capabilityNames());
  const warnings: string[] = [];
  const unknown = new Set<string>();
  for (const match of html.matchAll(/\bmapp\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g)) {
    const name = `${match[1]}.${match[2]}`;
    if (!known.has(name)) unknown.add(name);
  }
  if (unknown.size) warnings.push(`Unknown capabilities (they will fail): ${[...unknown].map((n) => `mapp.${n}`).join(', ')}. Use only the listed capabilities.`);
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(html)) warnings.push(message);
  const hardcoded = looksLikeSecret(html);
  if (hardcoded && hardcoded.suggestedName !== 'STRIPE_PUBLISHABLE_KEY') warnings.push('The code contains what looks like a real key or token. Remove it: use request_secret and {{secret:NAME}} instead.');
  if (!/m-nav|m-app|--safe-top/.test(html) && /position:\s*(fixed|sticky)/.test(html)) {
    warnings.push('Fixed/sticky elements must respect var(--safe-top)/var(--safe-bottom) or use the kit .m-nav/.m-tabbar.');
  }
  return warnings.length ? warnings : 'none';
}
