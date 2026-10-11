import { lifecycle } from '../lifecycle';
import { createResponseStream, isTransientError } from './responses';
import { session } from './session';
import { runTool, toolNamespaceFor, type ToolContext } from './tools';
import type { ChatMessage, ConversationItem, ParsedTurn } from './types';

export interface AgentHooks {
  onDelta(delta: string): void;
  onToolStart(name: string, args: Record<string, unknown>): void;
  /** Model is still writing a tool call (e.g. app code): chars so far. */
  onToolProgress?(name: string, chars: number): void;
  /** A dropped connection is being retried. */
  onRetry?(attempt: number): void;
  /** Mapp went to the background mid-request; waiting to come back. */
  onPaused?(): void;
  /** Saved after every completed step so an interrupted run can resume. */
  onCheckpoint?(input: ConversationItem[], answer: string): void;
  onToolEnd(name: string, ok: boolean, detail: string): void;
}

const MAX_STEPS = 16;

/**
 * Runs one user request: streams the model, executes mapp tools and loops
 * until the model answers without calling tools.
 */
export async function runAgent(
  history: ChatMessage[],
  instructions: string,
  ctx: ToolContext,
  hooks: AgentHooks,
  signal?: AbortSignal,
  resume?: { input: ConversationItem[]; answer: string },
): Promise<string> {
  const input: ConversationItem[] = resume
    ? [...resume.input]
    : history.slice(-24).map((m) => ({ role: m.role, content: m.content }));
  let answer = resume?.answer ?? '';

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (signal?.aborted) throw new Error('Stopped');
    const turn = await withRetry(() => session.withToken(async (accessToken) => {
      const stream = await createResponseStream({
        accessToken,
        input,
        instructions,
        tools: [toolNamespaceFor(ctx)],
      });
      let parsed: ParsedTurn | undefined;
      for await (const event of stream) {
        if (signal?.aborted) throw new Error('Stopped');
        if (event.type === 'text_delta') hooks.onDelta(event.delta);
        else if (event.type === 'tool_progress') hooks.onToolProgress?.(event.name, event.chars);
        else parsed = event.parsed;
      }
      if (!parsed) throw new Error('ChatGPT stream ended before completion');
      return parsed;
    }), hooks, signal);

    if (turn.assistantText) {
      answer += (answer ? '\n\n' : '') + turn.assistantText;
      input.push({ role: 'assistant', content: turn.assistantText });
    }
    if (!turn.toolCalls.length) break;

    // Preserve every call before adding outputs, including parallel tool calls.
    for (const call of turn.toolCalls) {
      input.push({
        type: 'function_call',
        call_id: call.callId,
        name: call.name,
        ...(call.namespace ? { namespace: call.namespace } : {}),
        arguments: JSON.stringify(call.arguments),
      });
    }
    for (const call of turn.toolCalls) {
      if (signal?.aborted) throw new Error('Stopped');
      hooks.onToolStart(call.name, call.arguments);
      let output: string;
      try {
        output = await runTool(call.name, call.arguments, ctx);
        hooks.onToolEnd(call.name, true, output.slice(0, 200));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output = JSON.stringify({ ok: false, error: message });
        hooks.onToolEnd(call.name, false, message);
      }
      input.push({ type: 'function_call_output', call_id: call.callId, output });
    }
    hooks.onCheckpoint?.(input, answer);
    if (step === MAX_STEPS) {
      const note = 'I paused after many steps. Send a message to continue.';
      answer += (answer ? '\n\n' : '') + note;
      hooks.onDelta(`\n${note}`);
    }
  }
  return answer;
}

/** Retries a model call up to twice when the connection drops. */
async function withRetry<T>(fn: () => Promise<T>, hooks: AgentHooks, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; ) {
    const startedAt = Date.now();
    try {
      return await fn();
    } catch (error) {
      if (signal?.aborted || !isTransientError(error)) throw error;
      // iOS suspends the WebView in the background and drops the stream.
      // That is not the network failing: wait for Mapp to come back and redo the step.
      if (lifecycle.backgroundedSince(startedAt)) {
        hooks.onPaused?.();
        await lifecycle.whenActive();
        if (signal?.aborted) throw error;
        hooks.onRetry?.(0);
        continue;
      }
      attempt++;
      if (attempt > 2) throw error;
      hooks.onRetry?.(attempt);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
