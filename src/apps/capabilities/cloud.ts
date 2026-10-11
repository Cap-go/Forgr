import { Share } from '@capacitor/share';
import { cloud, memberName, type DocOp } from '../../cloud/client';
import type { CapabilityContext, CapabilityGroup } from './types';
import { obj, optStr, startWatch, stopWatch, str } from './util';

function listOptions(args: Record<string, unknown>): Pick<DocOp, 'where' | 'order' | 'limit' | 'offset'> {
  const options = obj(args, 'options');
  return {
    where: options.where as DocOp['where'],
    order: optStr(options, 'order'),
    limit: typeof options.limit === 'number' ? options.limit : undefined,
    offset: typeof options.offset === 'number' ? options.offset : undefined,
  };
}

const appDocs = (ctx: CapabilityContext, op: DocOp) => cloud.appDocs(ctx.app.id, op);

export const cloudGroup: CapabilityGroup = {
  group: 'cloud',
  plugin: 'Mapp Cloud (Cloudflare Durable Objects)',
  summary: "The user's private online database, per app. Survives reinstalls and syncs across the user's devices. Needs the user signed in; use mapp.storage for offline-only data.",
  capabilities: [
    {
      name: 'cloud.put',
      params: ['collection', 'data', 'id'],
      signature: '(collection, data, id?) -> { id, data, createdAt, updatedAt }',
      doc: 'Create (no id) or replace a JSON document. Max 256 KB.',
      run: (args, ctx) => appDocs(ctx, { op: 'put', collection: str(args, 'collection'), data: args.data, id: optStr(args, 'id') }),
    },
    {
      name: 'cloud.get',
      params: ['collection', 'id'],
      signature: '(collection, id) -> doc | null',
      run: (args, ctx) => appDocs(ctx, { op: 'get', collection: str(args, 'collection'), id: str(args, 'id') }),
    },
    {
      name: 'cloud.list',
      params: ['collection', 'options'],
      signature: '(collection, { where?: {field: value}, order?: "field" | "-field", limit?, offset? }?) -> doc[]',
      doc: 'Newest first by default; where = equality on top level fields; limit max 500.',
      run: (args, ctx) => appDocs(ctx, { op: 'list', collection: str(args, 'collection'), ...listOptions(args) }),
    },
    {
      name: 'cloud.remove',
      params: ['collection', 'id'],
      signature: '(collection, id) -> true',
      run: (args, ctx) => appDocs(ctx, { op: 'delete', collection: str(args, 'collection'), id: str(args, 'id') }),
    },
  ],
};

const spaceId = (args: Record<string, unknown>) => str(args, 'spaceId').toUpperCase();

export const spacesGroup: CapabilityGroup = {
  group: 'spaces',
  plugin: 'Mapp Cloud shared spaces',
  summary: 'Share data with other people who use Mapp. A space is an isolated shared database; the owner shares an invite code/link, members join and every member\'s apps read and write it, with live updates. Put the data format in the description so other people\'s apps can use it.',
  capabilities: [
    {
      name: 'spaces.create',
      params: ['name', 'description'],
      signature: '(name, description) -> { spaceId, code, url }',
      doc: 'Creates a space owned by the user. description = what is shared and the document shape, e.g. "collection items: {title, done, addedBy}".',
      run: async (args) => {
        const created = await cloud.createSpace(str(args, 'name'), optStr(args, 'description') ?? '', memberName());
        return { spaceId: created.space.spaceId, code: created.code, url: created.url };
      },
    },
    {
      name: 'spaces.join',
      params: ['code'],
      signature: '(code) -> { spaceId, name, description, members }',
      doc: 'code = invite code like ABCD-EFGH-JKLM-NPQR.',
      run: (args) => cloud.joinSpace(str(args, 'code'), memberName()),
    },
    {
      name: 'spaces.mine',
      signature: '() -> [{ spaceId, name, role: "owner" | "member" }]',
      run: () => cloud.listSpaces(),
    },
    {
      name: 'spaces.info',
      params: ['spaceId'],
      signature: '(spaceId) -> { spaceId, name, description, members: [{ userId, name, role }] }',
      run: (args) => cloud.spaceInfo(spaceId(args)),
    },
    {
      name: 'spaces.invite',
      params: ['spaceId'],
      signature: '(spaceId) -> { code, url }',
      doc: 'Owner only. Opens the iOS share sheet with the invite link and returns it.',
      run: async (args, ctx) => {
        const invite = await cloud.invite(spaceId(args));
        if (ctx.native) {
          await Share.share({ title: 'Join my Mapp space', text: `Join my space on Mapp with code ${invite.code}`, url: invite.url }).catch(() => undefined);
        }
        return invite;
      },
    },
    {
      name: 'spaces.leave',
      params: ['spaceId'],
      signature: '(spaceId) -> true',
      run: async (args) => {
        await cloud.leaveSpace(spaceId(args));
        return true;
      },
    },
    {
      name: 'spaces.put',
      params: ['spaceId', 'collection', 'data', 'id'],
      signature: '(spaceId, collection, data, id?) -> doc (doc.author = userId of the writer)',
      run: (args) => cloud.spaceDocs(spaceId(args), { op: 'put', collection: str(args, 'collection'), data: args.data, id: optStr(args, 'id') }),
    },
    {
      name: 'spaces.get',
      params: ['spaceId', 'collection', 'id'],
      signature: '(spaceId, collection, id) -> doc | null',
      run: (args) => cloud.spaceDocs(spaceId(args), { op: 'get', collection: str(args, 'collection'), id: str(args, 'id') }),
    },
    {
      name: 'spaces.list',
      params: ['spaceId', 'collection', 'options'],
      signature: '(spaceId, collection, { where?, order?, limit? }?) -> doc[]',
      run: (args) => cloud.spaceDocs(spaceId(args), { op: 'list', collection: str(args, 'collection'), ...listOptions(args) }),
    },
    {
      name: 'spaces.remove',
      params: ['spaceId', 'collection', 'id'],
      signature: '(spaceId, collection, id) -> true',
      run: (args) => cloud.spaceDocs(spaceId(args), { op: 'delete', collection: str(args, 'collection'), id: str(args, 'id') }),
    },
    {
      name: 'spaces.subscribe',
      params: ['spaceId'],
      signature: '(spaceId) -> true',
      doc: 'Live updates while the app is open; reconnects automatically.',
      events: ['spaces.change'],
      run: async (args, ctx) => {
        const id = spaceId(args);
        await startWatch(ctx, `space:${id}`, async () => {
          let ws: WebSocket | null = null;
          let closed = false;
          let retry = 0;
          const connect = async () => {
            if (closed) return;
            ws = new WebSocket(await cloud.liveUrl(id));
            ws.onopen = () => { retry = 0; };
            ws.onmessage = (e) => {
              try { ctx.emit('spaces.change', { spaceId: id, ...JSON.parse(String(e.data)) }); } catch { /* ping */ }
            };
            ws.onclose = (e) => {
              if (closed || e.code === 4003 || e.code === 4004) return;
              retry = Math.min(retry + 1, 6);
              window.setTimeout(() => void connect(), 500 * 2 ** retry);
            };
          };
          await connect();
          return () => {
            closed = true;
            ws?.close();
          };
        });
        return true;
      },
    },
    {
      name: 'spaces.unsubscribe',
      params: ['spaceId'],
      signature: '(spaceId) -> boolean',
      run: (args, ctx) => stopWatch(ctx, `space:${spaceId(args)}`),
    },
  ],
};

export const functionsGroup: CapabilityGroup = {
  group: 'functions',
  plugin: 'Mapp Cloud functions (sandboxed Cloudflare Workers)',
  summary: "Call the user's own server functions deployed with the deploy_function tool (scheduled logic, API keys kept server side, webhooks, data shared by URL).",
  capabilities: [
    {
      name: 'functions.call',
      params: ['name', 'input'],
      signature: '(name, input?: JSON) -> { status, data }',
      doc: 'POSTs input as JSON to the function; data is its parsed JSON (or text) response.',
      run: (args) => cloud.call('POST', `/v1/functions/${str(args, 'name')}/run`, args.input ?? {}),
    },
  ],
};
