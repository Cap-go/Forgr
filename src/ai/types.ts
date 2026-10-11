export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Shown as an app card in the chat; content keeps a text summary for the model. */
  card?: { appId: string; version: number; kind: 'created' | 'updated' };
}

export type ToolOutput = string | Array<
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
>;

/** Multimodal user message (text + images) for the Responses API. */
export interface RichMessage {
  role: 'user' | 'assistant';
  content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' | 'low' | 'high' }>;
}

export type ConversationItem = ChatMessage | RichMessage
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
