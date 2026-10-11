import { describe, expect, test } from 'bun:test';
import { extFor, mimeFor, readMedia, safePath } from '../src/apps/media';

describe('media files', () => {
  test('paths stay inside the app files folder', () => {
    expect(safePath('files/photo-1.jpg')).toBe('files/photo-1.jpg');
    expect(() => safePath('../secrets.json')).toThrow();
    expect(() => safePath('files/../../other/data.json')).toThrow();
    expect(() => safePath('data.json')).toThrow();
  });

  test('mime types and extensions', () => {
    expect(extFor('image/jpeg')).toBe('jpg');
    expect(extFor('audio/mp4')).toBe('m4a');
    expect(mimeFor('files/a.m4a')).toBe('audio/mp4');
    expect(mimeFor('files/a.jpeg')).toBe('image/jpeg');
  });

  test('reads data URLs without touching the filesystem', async () => {
    const b64 = await readMedia('app1', 'data:image/png;base64,iVBORw0KGgo=');
    expect(b64).toMatchObject({ base64: 'iVBORw0KGgo=', mimeType: 'image/png', filename: 'file.png' });
    const text = await readMedia('app1', 'data:text/csv,a%2Cb%0A1%2C2');
    expect(atob(text.base64)).toBe('a,b\n1,2');
    await expect(readMedia('app1', 'ftp://x')).rejects.toThrow('Unsupported');
  });
});
