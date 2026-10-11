import { completeText, createResponseStream, resolveModel } from '../../ai/responses';
import { session } from '../../ai/session';
import type { ConversationItem } from '../../ai/types';
import { readMediaAsDataUrl } from '../media';
import type { CapabilityContext, CapabilityGroup } from './types';
import { obj } from './util';

const MAX_IMAGES = 4;

/** Builds Responses API input from a prompt or a message list, plus optional images. */
async function buildInput(args: Record<string, unknown>, ctx: CapabilityContext): Promise<ConversationItem[]> {
  const prompt = args.prompt;
  const options = obj(args, 'options');
  const refs = (Array.isArray(options.images) ? options.images : [])
    .map((i) => (i && typeof i === 'object' && 'path' in i ? String((i as { path: unknown }).path) : String(i)))
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
  // Paths and app file URLs are read on the host; https and data URLs go as is.
  const images = await Promise.all(refs.map((ref) => (/^(https:\/\/|data:image\/)/.test(ref) ? ref : readMediaAsDataUrl(ctx.app.id, ref))));
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(prompt)
    ? (prompt as Array<{ role?: string; content?: unknown }>).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
    }))
    : [{ role: 'user', content: String(prompt ?? '') }];
  if (!messages.some((m) => m.content.trim()) && !images.length) throw new Error('mapp.ai needs a prompt');
  const items: ConversationItem[] = messages.map((m) => ({ role: m.role, content: m.content }));
  if (images.length) {
    // Attach images to the last user message.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const index = lastUser ? messages.lastIndexOf(lastUser) : items.length;
    items[index] = {
      role: 'user',
      content: [
        { type: 'input_text', text: lastUser?.content || 'Describe this image.' },
        ...images.map((url) => ({ type: 'input_image' as const, image_url: url, detail: 'auto' as const })),
      ],
    };
  }
  return items;
}

function instructionsFor(args: Record<string, unknown>, ctx: CapabilityContext): string {
  const options = obj(args, 'options');
  const system = typeof options.system === 'string' && options.system
    ? options.system
    : `You are the assistant inside the user's personal app "${ctx.app.name}". Reply concisely.`;
  return options.json
    ? `${system}\n\nReply with ONLY valid JSON${typeof options.json === 'object' ? ` matching this JSON Schema: ${JSON.stringify(options.json)}` : ''}. No prose, no code fences.`
    : system;
}

/** Parses a JSON reply, tolerating code fences or text around it. */
export function parseJsonReply(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('The AI did not return valid JSON. Try again or simplify the request.');
  }
}

function requireSignedIn(): void {
  if (!session.signedIn) throw new Error('Sign in with ChatGPT in Mapp settings to use AI features.');
}

let streamSeq = 0;

export const ai: CapabilityGroup = {
  group: 'ai',
  plugin: "ChatGPT (the user's own plan, no API key)",
  summary: "Default AI for app features (summaries, chat, classification, photo analysis, extraction). Runs on the user's ChatGPT subscription; no key needed.",
  capabilities: [
    {
      name: 'ai.chat',
      params: ['prompt', 'options'],
      signature: "(prompt: string | {role:'user'|'assistant', content}[], { system?, images?: (path | url | photo)[], json?: true | JSONSchema }?) -> string | object",
      doc: 'images: up to 4 files/ paths, app file urls, https or data URLs (a camera result object works too). json returns a parsed object. Takes seconds: show a loading state.',
      run: async (args, ctx) => {
        requireSignedIn();
        const input = await buildInput(args, ctx);
        const instructions = instructionsFor(args, ctx);
        const text = await session.withToken((accessToken) => completeText({ accessToken, input, instructions }));
        return obj(args, 'options').json ? parseJsonReply(text) : text;
      },
    },
    {
      name: 'ai.stream',
      params: ['prompt', 'options'],
      signature: '(prompt, { system?, images?: (path | url)[] }?) -> { id }',
      doc: 'Live text for chat-like UIs: listen with mapp.on before calling, match the id.',
      events: ['ai.delta', 'ai.done', 'ai.error'],
      run: async (args, ctx) => {
        requireSignedIn();
        const input = await buildInput(args, ctx);
        const instructions = instructionsFor(args, ctx);
        const id = `s${++streamSeq}`;
        const controller = new AbortController();
        ctx.onDispose(() => controller.abort());
        void session.withToken(async (accessToken) => {
          const stream = await createResponseStream({ accessToken, input, instructions, signal: controller.signal });
          for await (const event of stream) {
            if (event.type === 'text_delta') ctx.emit('ai.delta', { id, delta: event.delta });
            if (event.type === 'completed') ctx.emit('ai.done', { id, text: event.parsed.assistantText });
          }
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) ctx.emit('ai.error', { id, message: error instanceof Error ? error.message : String(error) });
        });
        return { id };
      },
    },
    {
      name: 'ai.status',
      signature: '() -> { available: boolean, provider: "chatgpt", model? }',
      doc: 'Check before showing AI features; when unavailable, ask the user to sign in from Mapp settings.',
      run: async () => {
        if (!session.signedIn) return { available: false, provider: 'chatgpt' };
        const model = await session.withToken((token) => resolveModel(token)).catch(() => undefined);
        return { available: true, provider: 'chatgpt', model };
      },
    },
  ],
};
