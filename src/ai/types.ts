export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ToolOutput = string | Array<
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
>;

export type ConversationItem = ChatMessage
  | { type: 'function_call'; call_id: string; name: string; namespace?: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: ToolOutput };

export interface ToolCallRequest {
  callId: string;
  name: string;
  namespace?: string;
  arguments: Record<string, unknown>;
}

export interface ParsedTurn {
  responseId: string;
  assistantText: string;
  toolCalls: ToolCallRequest[];
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  /** Response headers arrived; buffered = slower fallback that only delivers at the end. */
  | { type: 'connected'; buffered: boolean }
  /** Streamed summary of the model's reasoning. */
  | { type: 'reasoning_delta'; delta: string }
  /** The model started writing a tool call. */
  | { type: 'tool_begin'; name: string }
  /** A tool call is being written: name and how many argument chars so far. */
  | { type: 'tool_progress'; name: string; chars: number }
  | { type: 'completed'; parsed: ParsedTurn };
