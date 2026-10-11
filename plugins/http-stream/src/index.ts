import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface HttpStreamStartOptions {
  /** Caller-chosen id so events can be matched before start() resolves. */
  id: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Seconds without receiving data before failing. Default 300. */
  timeout?: number;
}

export interface HttpStreamPlugin {
  start(options: HttpStreamStartOptions): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  addListener(event: 'response', fn: (e: { id: string; status: number; headers: Record<string, string> }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'chunk', fn: (e: { id: string; data: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'end', fn: (e: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', fn: (e: { id: string; message: string }) => void): Promise<PluginListenerHandle>;
}

/** Native only (iOS). Check Capacitor.isPluginAvailable('HttpStream') first. */
export const HttpStream = registerPlugin<HttpStreamPlugin>('HttpStream');
