import { listSecrets, normalizeSecretName, readSecret, secretInfo, type SecretKind } from '../../secrets';
import type { CapabilityContext, CapabilityGroup } from './types';
import { obj, str } from './util';

/** Apps created from an outside link never get secrets. */
function guard(ctx: CapabilityContext): void {
  if (ctx.app.origin === 'link') throw new Error('Apps created from a link cannot use secrets.');
}

export const secrets: CapabilityGroup = {
  group: 'secrets',
  plugin: 'iOS Keychain (Mapp vault)',
  summary: "The user's saved API keys and passwords. Prefer {{secret:NAME}} placeholders in mapp.http.fetch headers/body: Mapp fills them natively and your JS never holds the value.",
  capabilities: [
    {
      name: 'secrets.has',
      params: ['name'],
      signature: '(name) -> boolean',
      run: async (args, ctx) => {
        guard(ctx);
        return Boolean(secretInfo(normalizeSecretName(str(args, 'name'))));
      },
    },
    {
      name: 'secrets.list',
      signature: '() -> [{ name, label, kind, username? }] (names only, never values)',
      run: async (_args, ctx) => {
        guard(ctx);
        return listSecrets().map(({ name, label, kind, username }) => ({ name, label, kind, username }));
      },
    },
    {
      name: 'secrets.request',
      params: ['name', 'options'],
      signature: '(name, { label, kind?: "api_key"|"password"|"token"|"text", username? }?) -> { saved: boolean }',
      doc: 'Shows Mapp\'s secure entry sheet over the app (AutoFill for passwords). Use when a needed secret is missing.',
      run: async (args, ctx) => {
        guard(ctx);
        const options = obj(args, 'options');
        return ctx.host.requestSecret({
          name: normalizeSecretName(str(args, 'name')),
          label: typeof options.label === 'string' ? options.label : str(args, 'name'),
          kind: (options.kind as SecretKind) ?? 'api_key',
          username: typeof options.username === 'string' ? options.username : undefined,
          appName: ctx.app.name,
        });
      },
    },
    {
      name: 'secrets.get',
      params: ['name'],
      signature: '(name) -> string | null',
      doc: 'Only when the app must show or locally use the value (e.g. a password vault). Never log it, store it elsewhere or send it anywhere but its own service.',
      run: async (args, ctx) => {
        guard(ctx);
        return readSecret(normalizeSecretName(str(args, 'name')));
      },
    },
  ],
};
