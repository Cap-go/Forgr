import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

/*
 * Media files of a mini app (photos, recordings, scans, imports) live in its
 * folder: mapp/apps/<id>/files/. Capabilities hand apps a `path`
 * ("files/<name>", stable, store it in mapp.storage) and a `url` that works
 * directly in <img>, <audio> and <video>. Anything that takes media accepts
 * a path, that url, an https URL or a data: URL.
 */

export interface MediaFile {
  path: string;
  url: string;
  mimeType: string;
  size: number;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/json': 'json',
};

export function extFor(mimeType: string): string {
  return MIME_EXT[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin';
}

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const found = Object.entries(MIME_EXT).find(([, e]) => e === ext);
  return found?.[0] ?? (ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');
}

function root(appId: string): string {
  return `mapp/apps/${appId}`;
}

/** Validates an app-relative path ("files/…"); no escaping the app folder. */
export function safePath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  if (!/^files\/[^/]+$/.test(clean) || clean.includes('..')) throw new Error(`Invalid file path "${path}" (expected "files/<name>")`);
  return clean;
}

function uniqueName(ext: string, base?: string): string {
  const stem = (base ?? '').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || new Date().toISOString().replace(/[:.]/g, '-');
  return `${stem}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

export async function mediaUrl(appId: string, path: string): Promise<string> {
  const { uri } = await Filesystem.getUri({ path: `${root(appId)}/${safePath(path)}`, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri);
}

/** Writes bytes (base64) or text into the app's files folder. */
export async function writeMedia(appId: string, data: { base64?: string; text?: string; mimeType: string; name?: string }): Promise<MediaFile> {
  const path = `files/${uniqueName(extFor(data.mimeType), data.name)}`;
  await Filesystem.writeFile({
    path: `${root(appId)}/${path}`,
    directory: Directory.Data,
    recursive: true,
    ...(data.text !== undefined ? { data: data.text, encoding: Encoding.UTF8 } : { data: data.base64 ?? '' }),
  });
  const size = data.text !== undefined ? new Blob([data.text]).size : Math.floor(((data.base64 ?? '').length * 3) / 4);
  return { path, url: await mediaUrl(appId, path), mimeType: data.mimeType, size };
}

/** Moves a native temp file (e.g. a recording) into the app's files folder. */
export async function adoptFile(appId: string, sourceUri: string, mimeType: string): Promise<MediaFile> {
  const path = `files/${uniqueName(extFor(mimeType))}`;
  const { uri: target } = await Filesystem.getUri({ path: `${root(appId)}/files`, directory: Directory.Data });
  await Filesystem.mkdir({ path: `${root(appId)}/files`, directory: Directory.Data, recursive: true }).catch(() => undefined);
  await Filesystem.copy({ from: sourceUri, to: `${target}/${path.slice(6)}` });
  await Filesystem.deleteFile({ path: sourceUri }).catch(() => undefined);
  const stat = await Filesystem.stat({ path: `${root(appId)}/${path}`, directory: Directory.Data });
  return { path, url: await mediaUrl(appId, path), mimeType, size: stat.size };
}

export async function deleteMedia(appId: string, path: string): Promise<void> {
  await Filesystem.deleteFile({ path: `${root(appId)}/${safePath(path)}`, directory: Directory.Data });
}

export async function listMedia(appId: string): Promise<Array<{ path: string; size: number; mimeType: string }>> {
  try {
    const { files } = await Filesystem.readdir({ path: `${root(appId)}/files`, directory: Directory.Data });
    return files.filter((f) => f.type === 'file').map((f) => ({ path: `files/${f.name}`, size: f.size, mimeType: mimeFor(f.name) }));
  } catch {
    return [];
  }
}

/** Turns a Capacitor file URL of this app back into its "files/…" path. */
function pathFromUrl(appId: string, url: string): string | null {
  const marker = `/${root(appId)}/files/`;
  const at = decodeURIComponent(url).indexOf(marker);
  return at === -1 ? null : `files/${decodeURIComponent(url).slice(at + marker.length).split('?')[0]}`;
}

export interface MediaBytes {
  base64: string;
  mimeType: string;
  filename: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Resolves a path, app file URL, data: URL or https URL to base64 bytes. */
export async function readMedia(appId: string, ref: string): Promise<MediaBytes> {
  if (ref.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(ref);
    if (!match) throw new Error('Invalid data URL');
    const mimeType = match[1] ?? 'application/octet-stream';
    const base64 = match[2] ? match[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(match[3]))));
    return { base64, mimeType, filename: `file.${extFor(mimeType)}` };
  }
  const local = ref.startsWith('files/') ? ref : pathFromUrl(appId, ref);
  if (local) {
    const path = safePath(local);
    const stat = await Filesystem.stat({ path: `${root(appId)}/${path}`, directory: Directory.Data });
    if (stat.size > MAX_BYTES) throw new Error('File too large (max 25 MB)');
    const { data } = await Filesystem.readFile({ path: `${root(appId)}/${path}`, directory: Directory.Data });
    const base64 = typeof data === 'string' ? data : await blobToBase64(data);
    return { base64, mimeType: mimeFor(path), filename: path.slice(6) };
  }
  if (/^https:\/\//i.test(ref)) {
    const res = await CapacitorHttp.request({ url: ref, method: 'GET', responseType: 'blob' });
    if (res.status < 200 || res.status >= 300) throw new Error(`Could not download ${ref} (${res.status})`);
    const mimeType = String(res.headers['Content-Type'] ?? res.headers['content-type'] ?? 'application/octet-stream').split(';')[0];
    return { base64: String(res.data), mimeType, filename: ref.split('/').pop()?.split('?')[0] || `file.${extFor(mimeType)}` };
  }
  throw new Error(`Unsupported media reference "${ref.slice(0, 60)}" (use a files/ path, its url, https:// or data:)`);
}

export async function readMediaAsDataUrl(appId: string, ref: string): Promise<string> {
  if (ref.startsWith('data:')) return ref;
  const { base64, mimeType } = await readMedia(appId, ref);
  return `data:${mimeType};base64,${base64}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}
