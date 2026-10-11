import { appStore } from '../apps/store';
import { getLogs } from '../apps/bridge';
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
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if ('__invalid_json' in args) throw new Error('Tool arguments were not valid JSON. Try again with smaller edits.');
  const id = String(args.id ?? '');
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
      });
      await ctx.openApp(app.id);
      return JSON.stringify({ ok: true, id: app.id, opened: true, logs: await settleLogs(app.id, ctx) });
    }
    case 'write_app': {
      await appStore.writeHtml(id, requireHtml(args.html));
      await ctx.openApp(id);
      return JSON.stringify({ ok: true, logs: await settleLogs(id, ctx) });
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
      return JSON.stringify({ ok: true, applied: edits.length, logs: await settleLogs(id, ctx) });
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
