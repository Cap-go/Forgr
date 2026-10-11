import { describe, expect, test } from 'bun:test';

/** Builds an SSE body like the ChatGPT plan endpoint: final output list empty. */
function sse(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

describe('Responses stream parsing', () => {
  test('uses streamed items when response.completed has an empty output', async () => {
    const item = { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'create_app', namespace: 'mapp', arguments: '' };
    const body = sse([
      { type: 'response.created', response: { id: 'resp_1' } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"name":"Groc' },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: 'eries"}' },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"name":"Groceries"}' },
      { type: 'response.output_item.done', output_index: 0, item: { ...item, arguments: '{"name":"Groceries"}' } },
      { type: 'response.completed', response: { id: 'resp_1', output: [] } },
    ]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('/models')) return new Response(JSON.stringify({ models: [] }));
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    try {
      const { createResponseStream } = await import('../src/ai/responses');
      const stream = await createResponseStream({ accessToken: 't', input: [], instructions: '' });
      let completed;
      for await (const event of stream) if (event.type === 'completed') completed = event.parsed;
      expect(completed?.toolCalls).toHaveLength(1);
      expect(completed?.toolCalls[0]).toMatchObject({ name: 'create_app', namespace: 'mapp', arguments: { name: 'Groceries' } });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
