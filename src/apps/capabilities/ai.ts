import { completeText } from '../../ai/responses';
import { session } from '../../ai/session';
import type { ChatMessage } from '../../ai/types';
import type { CapabilityGroup } from './types';
import { obj } from './util';

export const ai: CapabilityGroup = {
  group: 'ai',
  plugin: 'ChatGPT (signed-in account)',
  summary: 'ask the AI',
  capabilities: [
    {
      name: 'ai.chat',
      params: ['prompt', 'options'],
      signature: "(prompt: string | {role:'user'|'assistant', content}[], { system? }?) -> string",
      doc: 'ask for JSON in prompt for structured output',
      run: async (args, ctx) => {
        const prompt = args.prompt;
        const input: ChatMessage[] = Array.isArray(prompt)
          ? (prompt as ChatMessage[]).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }))
          : [{ role: 'user', content: String(prompt ?? '') }];
        if (!input.some((m) => m.content.trim())) throw new Error('ai.chat needs a prompt');
        const system = obj(args, 'options').system ?? args.system;
        const instructions = typeof system === 'string' && system
          ? system
          : `You are the assistant inside the user's personal app "${ctx.app.name}". Reply concisely.`;
        return session.withToken((accessToken) => completeText({ accessToken, input, instructions }));
      },
    },
  ],
};
