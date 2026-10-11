import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface ExportFile {
  filename: string;
  /** Plain text content (CSV, JSON, Markdown…). */
  text?: string;
  /** Or binary content as a data: URL or bare base64. */
  dataUrl?: string;
  mimeType?: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

export function safeFilename(name: string, fallback = 'export.txt'): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^\.+/, '').trim().slice(0, 120);
  return clean || fallback;
}

export function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ({
    csv: 'text/csv', json: 'application/json', txt: 'text/plain', md: 'text/markdown', html: 'text/html',
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ics: 'text/calendar',
    xml: 'application/xml', tsv: 'text/tab-separated-values', vcf: 'text/vcard',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

/** RFC 4180 CSV from rows of values (first row usually the header). */
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Writes the file to the app cache and opens the iOS share sheet, where the
 * user picks Save to Files, AirDrop, Mail, Numbers… On the web it downloads.
 */
export async function exportFile(file: ExportFile): Promise<{ filename: string; shared: boolean }> {
  const filename = safeFilename(file.filename);
  const mimeType = file.mimeType ?? guessMime(filename);
  const base64 = file.dataUrl?.replace(/^data:[^,]*,/, '');
  if (file.text === undefined && !base64) throw new Error('Nothing to export: pass text or dataUrl');
  const size = file.text !== undefined ? new Blob([file.text]).size : Math.floor((base64!.length * 3) / 4);
  if (size > MAX_BYTES) throw new Error('File too large to export (max 25 MB)');

  if (!Capacitor.isNativePlatform()) {
    const blob = file.text !== undefined
      ? new Blob([file.text], { type: mimeType })
      : await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return { filename, shared: true };
  }

  const path = `exports/${Date.now()}/${filename}`;
  await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    recursive: true,
    ...(file.text !== undefined ? { data: file.text, encoding: Encoding.UTF8 } : { data: base64! }),
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri] });
    return { filename, shared: true };
  } catch (error) {
    // Closing the share sheet is not an error for the app.
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return { filename, shared: false };
    throw error;
  }
}
