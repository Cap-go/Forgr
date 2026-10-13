import { Capacitor } from '@capacitor/core';
import { findCapability, type CapabilityContext } from './capabilities';
import type { MiniAppMeta } from './store';

export interface LogEntry {
  level: string;
  message: string;
  at: number;
}

export interface BridgeHost {
  requestSecret(spec: { name: string; label: string; kind: import('../secrets').SecretKind; username?: string; appName: string }): Promise<{ saved: boolean }>;
  goHome(): void;
  openEditor(prompt?: string): void;
  openSwitcher(): void;
}

const MAX_LOGS = 80;
const logs = new Map<string, LogEntry[]>();

export function getLogs(appId: string): LogEntry[] {
  return logs.get(appId) ?? [];
}

export function clearLogs(appId: string): void {
  logs.delete(appId);
}

/** Connects one running mini app iframe to native plugins and the host shell. */
export class AppBridge {
  private readonly disposers: Array<() => void | Promise<void>> = [];
  private readonly ctx: CapabilityContext;
  private disposed = false;
  private readonly onMessage = (event: MessageEvent): void => {
    if (event.source !== this.frame.contentWindow) return;
    void this.handle(event.data as BridgeMessage);
  };

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly app: MiniAppMeta,
    private readonly host: BridgeHost,
  ) {
    this.ctx = {
      app,
      native: Capacitor.isNativePlatform(),
      emit: (name, payload) => {
        if (this.disposed) return;
        this.frame.contentWindow?.postMessage({ __mapp: 'event', name, payload }, '*');
      },
      onDispose: (fn) => {
        if (this.disposed) void Promise.resolve().then(fn).catch(() => undefined);
        else this.disposers.push(fn);
      },
      host: {
        goHome: () => this.host.goHome(),
        openEditor: (prompt) => this.host.openEditor(prompt),
        requestSecret: (spec) => this.host.requestSecret(spec),
      },
    };
    window.addEventListener('message', this.onMessage);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('message', this.onMessage);
    const fns = this.disposers.splice(0).reverse();
    for (const fn of fns) {
      try {
        void Promise.resolve(fn()).catch((error: unknown) => console.warn('[mapp] dispose failed', error));
      } catch (error) {
        console.warn('[mapp] dispose failed', error);
      }
    }
  }

  private async handle(msg: BridgeMessage): Promise<void> {
    if (!msg || typeof msg !== 'object') return;
    if (msg.__mapp === 'gesture') {
      if (msg.name === 'pinch-in') this.host.openSwitcher();
      return;
    }
    if (msg.__mapp === 'log') {
      const list = logs.get(this.app.id) ?? [];
      list.push({ level: String(msg.level), message: String(msg.message), at: Date.now() });
      logs.set(this.app.id, list.slice(-MAX_LOGS));
      return;
    }
    if (msg.__mapp !== 'call') return;
    try {
      const result = await this.call(String(msg.method), (msg.args ?? {}) as Record<string, unknown>);
      this.reply(msg.id, { result });
    } catch (error) {
      this.reply(msg.id, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private reply(id: unknown, body: { result?: unknown; error?: string }): void {
    this.frame.contentWindow?.postMessage({ __mapp: 'reply', id, ...body }, '*');
  }

  private async call(method: string, args: Record<string, unknown>): Promise<unknown> {
    const capability = findCapability(method);
    if (!capability) throw new Error(`Unknown capability "${method}". Not available in Forgr.`);
    const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    return capability.run(safeArgs, this.ctx);
  }
}

type BridgeMessage = {
  __mapp?: 'call' | 'log' | 'gesture' | 'event';
  id?: number;
  method?: string;
  args?: unknown;
  level?: string;
  message?: string;
  name?: string;
};
