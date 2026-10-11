import { createResponseStream } from './responses';
import { session } from './session';
import { MAPP_TOOL_NAMESPACE, runTool, type ToolContext } from './tools';
import type { ChatMessage, ConversationItem, ParsedTurn } from './types';

export interface AgentHooks {
  onDelta(delta: string): void;
  onToolStart(name: string, args: Record<string, unknown>): void;
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
): Promise<string> {
  const input: ConversationItem[] = history.slice(-24).map((m) => ({ role: m.role, content: m.content }));
  let answer = '';

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (signal?.aborted) throw new Error('Stopped');
    const turn = await session.withToken(async (accessToken) => {
      const stream = await createResponseStream({
        accessToken,
        input,
        instructions,
        tools: [MAPP_TOOL_NAMESPACE],
      });
      let parsed: ParsedTurn | undefined;
      for await (const event of stream) {
        if (event.type === 'text_delta') hooks.onDelta(event.delta);
        else parsed = event.parsed;
      }
      if (!parsed) throw new Error('ChatGPT stream ended before completion');
      return parsed;
    });

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
    if (step === MAX_STEPS) {
      const note = 'I paused after many steps. Send a message to continue.';
      answer += (answer ? '\n\n' : '') + note;
      hooks.onDelta(`\n${note}`);
    }
  }
  return answer;
}
