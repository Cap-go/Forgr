import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { MODELS_API_URL, RESPONSES_API_URL, RESPONSES_MODEL } from '../config';
import type { ConversationItem, ParsedTurn, StreamEvent, ToolCallRequest } from './types';

export interface ResponseRequest {
  accessToken: string;
  input: ConversationItem[];
  instructions: string;
  /** Function tools grouped in a namespace (required for ChatGPT plan usage). */
  tools?: unknown[];
}

export function isUsageLimitError(body: string): boolean {
  return body.includes('subscription_sharing_usage_limit_exceeded');
}

export function formatApiError(status: number, body: string): string {
  if (isUsageLimitError(body)) {
    return 'Your ChatGPT plan usage limit was reached. Wait for it to reset and try again.';
  }
  return `ChatGPT error (${status}): ${body.slice(0, 400)}`;
}

let cachedModel: { token: string; slug: string } | null = null;

/** Pick a model from the signed-in account's catalog (ChatGPT plans differ). */
export async function resolveModel(accessToken: string): Promise<string> {
  if (cachedModel?.token === accessToken) return cachedModel.slug;
  let slug = RESPONSES_MODEL;
  try {
    const res = await httpRequest(MODELS_API_URL, 'GET', accessToken);
    if (res.status === 200) {
      const body = JSON.parse(res.text) as { models?: Array<{ slug?: string; visibility?: string }> };
      const listed = (body.models ?? []).filter((m) => m.slug && m.visibility === 'list');
      const preferred = listed.find((m) => m.slug === RESPONSES_MODEL) ?? listed[0];
      if (preferred?.slug) slug = preferred.slug;
    }
  } catch {
    /* keep default */
  }
  cachedModel = { token: accessToken, slug };
  return slug;
}

export async function createResponseStream(req: ResponseRequest): Promise<AsyncIterable<StreamEvent>> {
  const model = await resolveModel(req.accessToken);
  const body = JSON.stringify({
    model,
    input: req.input,
    instructions: req.instructions,
    ...(req.tools?.length ? { tools: req.tools } : {}),
    stream: true,
    store: false,
  });

  if (Capacitor.isNativePlatform()) {
    // The WebView turns some errors (no CORS headers on admission failures)
    // into an opaque "Load failed". Native HTTP returns the real status and
    // body; the SSE text is buffered and parsed once complete.
    const res = await httpRequest(RESPONSES_API_URL, 'POST', req.accessToken, body);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(formatApiError(res.status, res.text));
    }
    const stream = new Response(res.text).body;
    if (!stream) throw new Error('ChatGPT returned an empty response');
    return parseSseStream(stream);
  }

  const res = await fetch(RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  if (!res.body) throw new Error('ChatGPT returned an empty response');
  return parseSseStream(res.body);
}

/** Single completion without tools, used by mini apps through mapp.ai.chat. */
export async function completeText(req: Omit<ResponseRequest, 'tools'>): Promise<string> {
  const stream = await createResponseStream(req);
  for await (const event of stream) {
    if (event.type === 'completed') return event.parsed.assistantText;
  }
  throw new Error('ChatGPT stream ended before completion');
}

async function httpRequest(
  url: string,
  method: 'GET' | 'POST',
  accessToken: string,
  body?: string,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: body ? JSON.parse(body) : undefined,
      responseType: 'text',
      readTimeout: 300_000,
      connectTimeout: 30_000,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return { status: res.status, text };
  }
  const res = await fetch(url, { method, headers, body });
  return { status: res.status, text: await res.text() };
}

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  const outputItems = new Map<number, Record<string, unknown>>();
  let responseId = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      if (done && buffer) lines.push(buffer);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const event = JSON.parse(payload) as Record<string, unknown>;
        const type = event.type;
        const response = event.response as Record<string, unknown> | undefined;
        if (response?.id) responseId = String(response.id);

        if (type === 'response.output_text.delta') {
          const delta = String(event.delta ?? '');
          assistantText += delta;
          yield { type: 'text_delta', delta };
        }
        if (type === 'response.output_item.added' || type === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (item) outputItems.set(Number(event.output_index), { ...item });
        }
        if (type === 'response.function_call_arguments.delta' ||
            type === 'response.function_call_arguments.done') {
          const item = [...outputItems.values()].find((i) => i.id === event.item_id);
          if (item) {
            item.arguments = type.endsWith('.done') ? event.arguments :
              String(item.arguments ?? '') + String(event.delta ?? '');
          }
        }
        if (type === 'error' || type === 'response.failed' || type === 'response.incomplete') {
          const error = (response?.error ?? event.error ?? event) as { message?: string };
          throw new Error(error.message ?? `ChatGPT stream: ${String(type)}`);
        }
        if (type === 'response.completed') {
          // The final payload is authoritative; done items cover streams without output here.
          const parsed = parseResponsesJson({
            id: responseId,
            output: response?.output ?? [...outputItems.entries()]
              .sort(([a], [b]) => a - b).map(([, item]) => item),
          });
          if (!parsed.assistantText) parsed.assistantText = assistantText;
          yield { type: 'completed', parsed };
          return;
        }
      }
      if (done) throw new Error('ChatGPT stream ended before completion');
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseResponsesJson(payload: Record<string, unknown>): ParsedTurn {
  const output = (payload.output as Array<Record<string, unknown>>) ?? [];
  let assistantText = '';
  const toolCalls: ToolCallRequest[] = [];

  for (const item of output) {
    if (item.type === 'message') {
      const content = (item.content as Array<Record<string, unknown>>) ?? [];
      for (const part of content) {
        if (part.type === 'output_text') assistantText += String(part.text ?? '');
      }
    }
    if (item.type === 'function_call') {
      if (!item.call_id) throw new Error('Function call is missing call_id');
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(String(item.arguments || '{}')) as Record<string, unknown>;
      } catch {
        args = { __invalid_json: String(item.arguments ?? '') };
      }
      toolCalls.push({
        callId: String(item.call_id),
        name: String(item.name ?? ''),
        namespace: item.namespace ? String(item.namespace) : undefined,
        arguments: args,
      });
    }
  }
  return { responseId: String(payload.id ?? ''), assistantText, toolCalls };
}
