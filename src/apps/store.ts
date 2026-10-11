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
  /** 'link' when created by a request from an outside link: no secrets for it. */
  origin?: 'chat' | 'link';
}

/*
 * Every app is one folder, like a Capgo live update bundle:
 *
 *   mapp/apps/<id>/manifest.json   name, icon, version (source of truth)
 *   mapp/apps/<id>/index.html      current code
 *   mapp/apps/<id>/versions/<n>.html  previous versions for Undo
 *   mapp/apps/<id>/data.json       mapp.storage data
 *   mapp/apps/<id>/chat.json       the builder conversation for this app
 *   mapp/apps/<id>/job.json        an interrupted builder run, if any
 *   mapp/home/chat.json, job.json  the "new app" conversation
 */
const ROOT = 'mapp';
const APPS = `${ROOT}/apps`;
const HOME = `${ROOT}/home`;
const LEGACY_INDEX = `${ROOT}/apps.json`;
const MAX_VERSIONS = 30;
export const HOME_CHAT = 'home';

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

async function listDirs(path: string): Promise<string[]> {
  try {
    const res = await Filesystem.readdir({ path, directory: Directory.Data });
    return res.files.filter((f) => f.type === 'directory').map((f) => f.name);
  } catch {
    return [];
  }
}

function appDir(id: string): string {
  return `${APPS}/${id}`;
}

/** Folder holding a conversation: the app's folder, or mapp/home for new apps. */
function chatDir(key: string): string {
  return key === HOME_CHAT ? HOME : appDir(key);
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
      await this.migrate();
      const apps: MiniAppMeta[] = [];
      for (const id of await listDirs(APPS)) {
        const raw = await readText(`${appDir(id)}/manifest.json`);
        if (raw) apps.push(JSON.parse(raw) as MiniAppMeta);
      }
      this.apps = apps;
      this.loaded = true;
    }
    return this.list();
  }

  /** 1.1.x kept one apps.json index and chats/jobs in shared folders: move them into each app. */
  private async migrate(): Promise<void> {
    const raw = await readText(LEGACY_INDEX);
    if (!raw) return;
    for (const app of JSON.parse(raw) as MiniAppMeta[]) {
      await writeText(`${appDir(app.id)}/manifest.json`, JSON.stringify(app, null, 2));
    }
    for (const key of [HOME_CHAT, ...(JSON.parse(raw) as MiniAppMeta[]).map((a) => a.id)]) {
      const chat = await readText(`${ROOT}/chats/${key}.json`);
      if (chat) await writeText(`${chatDir(key)}/chat.json`, chat);
      const job = await readText(`${ROOT}/jobs/${key}.json`);
      if (job) await writeText(`${chatDir(key)}/job.json`, job);
    }
    await Filesystem.rmdir({ path: `${ROOT}/chats`, directory: Directory.Data, recursive: true }).catch(() => undefined);
    await Filesystem.rmdir({ path: `${ROOT}/jobs`, directory: Directory.Data, recursive: true }).catch(() => undefined);
    await remove(LEGACY_INDEX);
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

  private async saveManifest(app: MiniAppMeta): Promise<void> {
    await writeText(`${appDir(app.id)}/manifest.json`, JSON.stringify(app, null, 2));
    this.emit();
  }

  async create(input: { name: string; emoji?: string; color?: string; description?: string; html: string; origin?: 'chat' | 'link' }): Promise<MiniAppMeta> {
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
      origin: input.origin ?? 'chat',
    };
    await writeText(`${appDir(app.id)}/index.html`, input.html);
    await writeText(`${appDir(app.id)}/versions/1.html`, input.html);
    this.apps.push(app);
    await this.saveManifest(app);
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
    await this.saveManifest(app);
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
    await this.saveManifest(app);
    return app;
  }

  async delete(id: string): Promise<void> {
    this.apps = this.apps.filter((a) => a.id !== id);
    await Filesystem.rmdir({ path: appDir(id), directory: Directory.Data, recursive: true })
      .catch(() => undefined);
    this.emit();
  }

  async readData(id: string): Promise<Record<string, unknown>> {
    const raw = await readText(`${appDir(id)}/data.json`);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  async writeData(id: string, data: Record<string, unknown>): Promise<void> {
    await writeText(`${appDir(id)}/data.json`, JSON.stringify(data));
  }

  async readChat(key: string): Promise<ChatMessage[]> {
    const raw = await readText(`${chatDir(key)}/chat.json`);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  }

  async readJob(key: string): Promise<PendingJob | null> {
    const raw = await readText(`${chatDir(key)}/job.json`);
    return raw ? (JSON.parse(raw) as PendingJob) : null;
  }

  async writeJob(key: string, job: PendingJob): Promise<void> {
    await writeText(`${chatDir(key)}/job.json`, JSON.stringify(job));
  }

  async clearJob(key: string): Promise<void> {
    await remove(`${chatDir(key)}/job.json`);
  }

  async writeChat(key: string, messages: ChatMessage[]): Promise<void> {
    // A deleted app's conversation is gone with its folder; don't recreate it.
    if (key !== HOME_CHAT && !this.get(key)) return;
    await writeText(`${chatDir(key)}/chat.json`, JSON.stringify(messages.slice(-200)));
  }

  /** Starts a fresh conversation (the app's code and data stay). */
  async clearChat(key: string): Promise<void> {
    await remove(`${chatDir(key)}/chat.json`);
    await remove(`${chatDir(key)}/job.json`);
  }
}

export const appStore = new AppStore();
