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
  | { type: 'completed'; parsed: ParsedTurn };
