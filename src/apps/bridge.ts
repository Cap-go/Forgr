import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { completeText } from '../ai/responses';
import { session } from '../ai/session';
import type { ChatMessage } from '../ai/types';
import { appStore, type MiniAppMeta } from './store';

export interface LogEntry {
  level: string;
  message: string;
  at: number;
}

export interface BridgeHost {
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
  private dataCache: Record<string, unknown> | null = null;
  private readonly onMessage = (event: MessageEvent): void => {
    if (event.source !== this.frame.contentWindow) return;
    void this.handle(event.data as BridgeMessage);
  };

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly app: MiniAppMeta,
    private readonly host: BridgeHost,
  ) {
    window.addEventListener('message', this.onMessage);
  }

  dispose(): void {
    window.removeEventListener('message', this.onMessage);
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

  private async data(): Promise<Record<string, unknown>> {
    this.dataCache ??= await appStore.readData(this.app.id);
    return this.dataCache;
  }

  private async call(method: string, args: Record<string, unknown>): Promise<unknown> {
    const native = Capacitor.isNativePlatform();
    switch (method) {
      case 'storage.get':
        return (await this.data())[String(args.key)] ?? null;
      case 'storage.set': {
        const data = await this.data();
        data[String(args.key)] = args.value;
        await appStore.writeData(this.app.id, data);
        return true;
      }
      case 'storage.remove': {
        const data = await this.data();
        delete data[String(args.key)];
        await appStore.writeData(this.app.id, data);
        return true;
      }
      case 'storage.keys':
        return Object.keys(await this.data());

      case 'haptics.impact': {
        const style = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[
          String(args.style) as 'light'
        ] ?? ImpactStyle.Light;
        if (native) await Haptics.impact({ style });
        return true;
      }
      case 'haptics.notification': {
        const type = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[
          String(args.type) as 'success'
        ] ?? NotificationType.Success;
        if (native) await Haptics.notification({ type });
        return true;
      }
      case 'haptics.selection':
        if (native) await Haptics.selectionChanged();
        return true;

      case 'camera.photo': {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: args.source === 'photos' ? CameraSource.Photos : args.source === 'camera' ? CameraSource.Camera : CameraSource.Prompt,
          quality: typeof args.quality === 'number' ? args.quality : 70,
          width: 1600,
        });
        return { dataUrl: photo.dataUrl, format: photo.format };
      }

      case 'location.current': {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
      }

      case 'notifications.schedule': {
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') throw new Error('Notifications permission denied');
        const id = typeof args.id === 'number' ? args.id : Math.floor(Math.random() * 2_000_000_000);
        const at = args.at ? new Date(args.at as string | number) : new Date(Date.now() + 1000);
        const every = args.every as 'day' | 'hour' | 'week' | 'minute' | undefined;
        await LocalNotifications.schedule({
          notifications: [{
            id,
            title: String(args.title ?? this.app.name),
            body: String(args.body ?? ''),
            schedule: every ? { at, every, repeats: true } : { at },
            extra: { appId: this.app.id },
          }],
        });
        return { id };
      }
      case 'notifications.cancel':
        await LocalNotifications.cancel({ notifications: [{ id: Number(args.id) }] });
        return true;

      case 'share':
        await Share.share({ title: args.title as string, text: args.text as string, url: args.url as string });
        return true;

      case 'clipboard.write':
        await Clipboard.write({ string: String(args.text ?? '') });
        return true;
      case 'clipboard.read':
        return (await Clipboard.read()).value;

      case 'http.fetch': {
        const url = String(args.url ?? '');
        if (!/^https?:\/\//i.test(url)) throw new Error('mapp.http.fetch needs an absolute http(s) URL');
        const res = await CapacitorHttp.request({
          url,
          method: String(args.method ?? 'GET').toUpperCase(),
          headers: (args.headers as Record<string, string>) ?? {},
          data: args.body,
          responseType: 'text',
        });
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        let json: unknown = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        return { status: res.status, headers: res.headers, text, json };
      }

      case 'ai.chat': {
        const prompt = args.prompt;
        const input: ChatMessage[] = Array.isArray(prompt)
          ? (prompt as ChatMessage[]).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }))
          : [{ role: 'user', content: String(prompt ?? '') }];
        const instructions = typeof args.system === 'string' && args.system
          ? args.system
          : `You are the assistant inside the user's personal app "${this.app.name}". Reply concisely.`;
        return session.withToken((accessToken) => completeText({ accessToken, input, instructions }));
      }

      case 'app.info':
        return { id: this.app.id, name: this.app.name, emoji: this.app.emoji, color: this.app.color, version: this.app.version, platform: Capacitor.getPlatform() };
      case 'app.home':
        this.host.goHome();
        return true;
      case 'app.edit':
        this.host.openEditor(typeof args.prompt === 'string' ? args.prompt : undefined);
        return true;
      case 'app.openUrl': {
        const url = String(args.url ?? '');
        if (!/^https?:\/\//i.test(url)) throw new Error('openUrl needs an absolute http(s) URL');
        if (native) await InAppBrowser.open({ url });
        else window.open(url, '_blank', 'noopener');
        return true;
      }
      default:
        throw new Error(`Unknown mapp method "${method}"`);
    }
  }
}

type BridgeMessage = {
  __mapp?: 'call' | 'log' | 'gesture';
  id?: number;
  method?: string;
  args?: unknown;
  level?: string;
  message?: string;
  name?: string;
};
