import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { HttpStream } from '@capgo/http-stream';
import { MODELS_API_URL, RESPONSES_API_URL, RESPONSES_MODEL } from '../config';
import type { ConversationItem, ParsedTurn, StreamEvent, ToolCallRequest } from './types';

export interface ResponseRequest {
  accessToken: string;
  input: ConversationItem[];
  instructions: string;
  /** Function tools grouped in a namespace (required for ChatGPT plan usage). */
  tools?: unknown[];
  /** Aborts the HTTP request itself, so Stop is immediate. */
  signal?: AbortSignal;
  /** Called when only the slow, all-at-once native request is available. */
  onBuffered?: () => void;
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

/** Set when the account's model rejects reasoning summaries; not asked again. */
let reasoningSummaries = true;

export async function createResponseStream(req: ResponseRequest): Promise<AsyncIterable<StreamEvent>> {
  try {
    return await openStream(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (reasoningSummaries && /\(400\)/.test(message) && /reasoning|summary/i.test(message)) {
      reasoningSummaries = false;
      return openStream(req);
    }
    throw error;
  }
}

/** Metadata about one model request (no prompt or reply text), for diagnostics. */
export interface RequestDiag {
  model: string;
  path: 'stream' | 'buffered' | 'native-stream';
  status?: number;
  startedAt: number;
  ms?: number;
  fetchError?: string;
  error?: string;
  events: Record<string, number>;
  outputTypes: string[];
  textChars: number;
  toolCalls: string[];
  bytes: number;
}

let requestLog: RequestDiag[] = [];

/** Returns and clears the requests recorded since the last call. */
export function takeRequestLog(): RequestDiag[] {
  const log = requestLog;
  requestLog = [];
  return log;
}

async function openStream(req: ResponseRequest): Promise<AsyncIterable<StreamEvent>> {
  const model = await resolveModel(req.accessToken);
  const diag: RequestDiag = { model, path: 'stream', startedAt: Date.now(), events: {}, outputTypes: [], textChars: 0, toolCalls: [], bytes: 0 };
  requestLog.push(diag);
  if (requestLog.length > 40) requestLog.shift();
  const body = JSON.stringify({
    model,
    input: req.input,
    instructions: req.instructions,
    ...(req.tools?.length ? { tools: req.tools } : {}),
    ...(reasoningSummaries ? { reasoning: { summary: 'auto' } } : {}),
    stream: true,
    store: false,
  });

  const headers = {
    Authorization: `Bearer ${req.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  // Best path on iPhone: native streaming (no CORS, live events).
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('HttpStream')) {
    diag.path = 'native-stream';
    try {
      return await nativeStream(body, headers, diag, req.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Real API answers (4xx/5xx, usage limits) and Stop are final; a plugin
      // or connection failure before any response falls back to the old path.
      if (req.signal?.aborted || diag.status !== undefined) throw error;
      diag.fetchError = `native-stream: ${message}`;
      return bufferedRequest(req, body, diag);
    }
  }

  // Older native builds: the WebView fetch is refused by CORS, so after the
  // first failure go straight to the native request (it only returns once
  // ChatGPT has finished, so say so right away).
  if (Capacitor.isNativePlatform() && webFetchBlocked) return bufferedRequest(req, body, diag);

  let res: Response;
  try {
    res = await fetch(RESPONSES_API_URL, { method: 'POST', headers, body, signal: req.signal });
  } catch (error) {
    if (req.signal?.aborted) throw new Error('Stopped');
    diag.fetchError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (!Capacitor.isNativePlatform()) throw error;
    webFetchBlocked = true;
    return bufferedRequest(req, body, diag);
  }
  diag.status = res.status;
  if (!res.ok) {
    const text = await res.text();
    diag.error = text.slice(0, 300);
    throw new Error(formatApiError(res.status, text));
  }
  if (!res.body) throw new Error('ChatGPT returned an empty response');
  return parseSseStream(res.body, false, diag);
}

let webFetchBlocked = false;

async function bufferedRequest(req: ResponseRequest, body: string, diag: RequestDiag): Promise<AsyncIterable<StreamEvent>> {
  diag.path = 'buffered';
  req.onBuffered?.();
  const native = await httpRequest(RESPONSES_API_URL, 'POST', req.accessToken, body);
  if (req.signal?.aborted) throw new Error('Stopped');
  diag.status = native.status;
  diag.bytes = native.text.length;
  if (native.status < 200 || native.status >= 300) {
    diag.error = native.text.slice(0, 300);
    throw new Error(formatApiError(native.status, native.text));
  }
  const stream = new Response(native.text).body;
  if (!stream) throw new Error('ChatGPT returned an empty response');
  return parseSseStream(stream, true, diag);
}

/** Streams the response through the native HttpStream plugin, chunk by chunk. */
async function nativeStream(body: string, headers: Record<string, string>, diag: RequestDiag, signal?: AbortSignal): Promise<AsyncIterable<StreamEvent>> {
  const id = crypto.randomUUID();
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { void HttpStream.cancel({ id }); },
  });
  let resolveStatus!: (status: number) => void;
  let rejectStatus!: (error: Error) => void;
  const statusReady = new Promise<number>((resolve, reject) => { resolveStatus = resolve; rejectStatus = reject; });
  const handles = await Promise.all([
    HttpStream.addListener('response', (e) => { if (e.id === id) resolveStatus(e.status); }),
    HttpStream.addListener('chunk', (e) => { if (e.id === id && !closed) controller.enqueue(encoder.encode(e.data)); }),
    HttpStream.addListener('end', (e) => {
      if (e.id !== id) return;
      closed = true;
      controller.close();
      cleanup();
    }),
    HttpStream.addListener('error', (e) => {
      if (e.id !== id) return;
      const error = new Error(signal?.aborted ? 'Stopped' : e.message);
      rejectStatus(error);
      if (!closed) controller.error(error);
      closed = true;
      cleanup();
    }),
  ]);
  const cleanup = () => handles.forEach((h) => void h.remove());
  signal?.addEventListener('abort', () => void HttpStream.cancel({ id }), { once: true });
  await HttpStream.start({ id, url: RESPONSES_API_URL, method: 'POST', headers, body, timeout: 300 });
  const status = await statusReady;
  diag.status = status;
  if (status < 200 || status >= 300) {
    const text = await new Response(stream).text();
    diag.error = text.slice(0, 300);
    throw new Error(formatApiError(status, text));
  }
  return parseSseStream(stream, false, diag);
}

/** Dropped connections and timeouts worth retrying automatically. */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network connection was lost|load failed|failed to fetch|timed out|timeout|ECONNRESET|socket|stream ended before completion|\((500|502|503|504)\)/i.test(message);
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

async function* parseSseStream(body: ReadableStream<Uint8Array>, buffered = false, diag?: RequestDiag): AsyncIterable<StreamEvent> {
  yield { type: 'connected', buffered };
  try {
    yield* parseEvents(body, diag);
  } catch (error) {
    if (diag) diag.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
    throw error;
  } finally {
    if (diag) diag.ms = Date.now() - diag.startedAt;
  }
}

async function* parseEvents(body: ReadableStream<Uint8Array>, diag?: RequestDiag): AsyncIterable<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  const outputItems = new Map<number, Record<string, unknown>>();
  let responseId = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (diag && value) diag.bytes += value.length;
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
        if (diag) diag.events[String(type)] = (diag.events[String(type)] ?? 0) + 1;
        const response = event.response as Record<string, unknown> | undefined;
        if (response?.id) responseId = String(response.id);

        if (type === 'response.output_text.delta') {
          const delta = String(event.delta ?? '');
          assistantText += delta;
          yield { type: 'text_delta', delta };
        }
        if (type === 'response.reasoning_summary_text.delta') {
          yield { type: 'reasoning_delta', delta: String(event.delta ?? '') };
        }
        if (type === 'response.reasoning_summary_part.done') {
          yield { type: 'reasoning_delta', delta: '\n\n' };
        }
        if (type === 'response.output_item.added' || type === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (item) outputItems.set(Number(event.output_index), { ...item });
          if (item?.type === 'function_call' && type === 'response.output_item.added') {
            yield { type: 'tool_begin', name: String(item.name ?? '') };
          }
        }
        if (type === 'response.function_call_arguments.delta' ||
            type === 'response.function_call_arguments.done') {
          const item = [...outputItems.values()].find((i) => i.id === event.item_id);
          if (item) {
            item.arguments = type.endsWith('.done') ? event.arguments :
              String(item.arguments ?? '') + String(event.delta ?? '');
            yield { type: 'tool_progress', name: String(item.name ?? ''), chars: String(item.arguments ?? '').length };
          }
        }
        if (type === 'error' || type === 'response.failed' || type === 'response.incomplete') {
          const error = (response?.error ?? event.error ?? event) as { message?: string };
          throw new Error(error.message ?? `ChatGPT stream: ${String(type)}`);
        }
        if (type === 'response.completed') {
          // The final payload is authoritative; done items cover streams without output here.
          // With store:false the final event can carry an empty output list:
          // the items streamed before it are then the only record of the turn.
          const streamed = [...outputItems.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
          const final = Array.isArray(response?.output) ? (response.output as Array<Record<string, unknown>>) : [];
          const output = final.length ? final : streamed;
          const parsed = parseResponsesJson({ id: responseId, output });
          if (!parsed.assistantText) parsed.assistantText = assistantText;
          if (diag) {
            const out = output;
            diag.outputTypes = out.map((o) => String(o.type) + (o.namespace ? `:${String(o.namespace)}` : ''));
            diag.textChars = parsed.assistantText.length;
            diag.toolCalls = parsed.toolCalls.map((c) => c.name);
          }
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
