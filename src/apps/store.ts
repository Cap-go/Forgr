import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { ChatMessage, ConversationItem } from '../ai/types';

/** An agent run saved after each step so it can continue after iOS suspends or kills Mapp. */
export interface PendingJob {
  prompt: string;
  input: ConversationItem[];
  answer: string;
  savedAt: number;
  /** Started from an outside link: keeps the restricted toolset on resume. */
  restricted?: boolean;
}

export interface MiniAppMeta {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Increments on each code change; older versions are kept for undo. */
  version: number;
}

const ROOT = 'mapp';
const INDEX = `${ROOT}/apps.json`;
const MAX_VERSIONS = 30;

async function readText(path: string): Promise<string | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof res.data === 'string' ? res.data : await res.data.text();
  } catch {
    return null;
  }
}

async function writeText(path: string, data: string): Promise<void> {
  await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

async function remove(path: string): Promise<void> {
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
}

function appDir(id: string): string {
  return `${ROOT}/apps/${id}`;
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

type Listener = () => void;

/** Every mini app lives on the device: html, versions, data and chat. */
class AppStore {
  private apps: MiniAppMeta[] = [];
  private loaded = false;
  private listeners = new Set<Listener>();

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async load(): Promise<MiniAppMeta[]> {
    if (!this.loaded) {
      const raw = await readText(INDEX);
      this.apps = raw ? (JSON.parse(raw) as MiniAppMeta[]) : [];
      this.loaded = true;
    }
    return this.list();
  }

  list(): MiniAppMeta[] {
    return [...this.apps].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): MiniAppMeta | undefined {
    return this.apps.find((a) => a.id === id);
  }

  require(id: string): MiniAppMeta {
    const app = this.get(id);
    if (!app) throw new Error(`No app with id "${id}". Call list_apps to see ids.`);
    return app;
  }

  private async saveIndex(): Promise<void> {
    await writeText(INDEX, JSON.stringify(this.apps));
    this.emit();
  }

  async create(input: { name: string; emoji?: string; color?: string; description?: string; html: string }): Promise<MiniAppMeta> {
    await this.load();
    const now = Date.now();
    const app: MiniAppMeta = {
      id: newId(),
      name: input.name.trim().slice(0, 40) || 'My app',
      emoji: input.emoji?.trim() || '✨',
      color: input.color?.trim() || '#6d4dff',
      description: input.description?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await writeText(`${appDir(app.id)}/index.html`, input.html);
    await writeText(`${appDir(app.id)}/versions/1.html`, input.html);
    this.apps.push(app);
    await this.saveIndex();
    return app;
  }

  async readHtml(id: string): Promise<string> {
    this.require(id);
    return (await readText(`${appDir(id)}/index.html`)) ?? '';
  }

  async writeHtml(id: string, html: string): Promise<MiniAppMeta> {
    const app = this.require(id);
    app.version += 1;
    app.updatedAt = Date.now();
    await writeText(`${appDir(id)}/index.html`, html);
    await writeText(`${appDir(id)}/versions/${app.version}.html`, html);
    await remove(`${appDir(id)}/versions/${app.version - MAX_VERSIONS}.html`);
    await this.saveIndex();
    return app;
  }

  /** Restores the previous version as a new version, so undo is itself undoable. */
  async undo(id: string): Promise<boolean> {
    const app = this.require(id);
    for (let v = app.version - 1; v >= Math.max(1, app.version - MAX_VERSIONS + 1); v--) {
      const html = await readText(`${appDir(id)}/versions/${v}.html`);
      if (html !== null) {
        await this.writeHtml(id, html);
        return true;
      }
    }
    return false;
  }

  async updateInfo(id: string, patch: Partial<Pick<MiniAppMeta, 'name' | 'emoji' | 'color' | 'description'>>): Promise<MiniAppMeta> {
    const app = this.require(id);
    if (patch.name?.trim()) app.name = patch.name.trim().slice(0, 40);
    if (patch.emoji?.trim()) app.emoji = patch.emoji.trim();
    if (patch.color?.trim()) app.color = patch.color.trim();
    if (patch.description !== undefined) app.description = patch.description.trim();
    app.updatedAt = Date.now();
    await this.saveIndex();
    return app;
  }

  async delete(id: string): Promise<void> {
    this.apps = this.apps.filter((a) => a.id !== id);
    await Filesystem.rmdir({ path: appDir(id), directory: Directory.Data, recursive: true })
      .catch(() => undefined);
    await this.saveIndex();
  }

  async readData(id: string): Promise<Record<string, unknown>> {
    const raw = await readText(`${appDir(id)}/data.json`);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  async writeData(id: string, data: Record<string, unknown>): Promise<void> {
    await writeText(`${appDir(id)}/data.json`, JSON.stringify(data));
  }

  async readChat(key: string): Promise<ChatMessage[]> {
    const raw = await readText(`${ROOT}/chats/${key}.json`);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  }

  async readJob(key: string): Promise<PendingJob | null> {
    const raw = await readText(`${ROOT}/jobs/${key}.json`);
    return raw ? (JSON.parse(raw) as PendingJob) : null;
  }

  async writeJob(key: string, job: PendingJob): Promise<void> {
    await writeText(`${ROOT}/jobs/${key}.json`, JSON.stringify(job));
  }

  async clearJob(key: string): Promise<void> {
    await remove(`${ROOT}/jobs/${key}.json`);
  }

  async writeChat(key: string, messages: ChatMessage[]): Promise<void> {
    await writeText(`${ROOT}/chats/${key}.json`, JSON.stringify(messages.slice(-60)));
  }
}

export const appStore = new AppStore();
