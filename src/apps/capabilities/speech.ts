import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import type { CapabilityContext, CapabilityGroup } from './types';
import { ensureGranted, optNum, optStr, requireNative, startWatch, stopWatch } from './util';

const transcripts = new WeakMap<CapabilityContext, string>();

async function ready(ctx: CapabilityContext): Promise<void> {
  requireNative(ctx);
  if (!(await SpeechRecognition.available()).available) throw new Error('Speech recognition not available on this device');
  const perm = await SpeechRecognition.checkPermissions();
  if (perm.speechRecognition !== 'granted') {
    ensureGranted((await SpeechRecognition.requestPermissions()).speechRecognition, 'Microphone & Speech Recognition');
  }
}

/** Starts a session that emits partial text; `onStopped` fires when the recognizer ends on its own. */
async function begin(ctx: CapabilityContext, args: Record<string, unknown>, onStopped?: () => void): Promise<void> {
  transcripts.set(ctx, '');
  await startWatch(ctx, 'speech', async () => {
    const handles: PluginListenerHandle[] = [];
    handles.push(await SpeechRecognition.addListener('partialResults', (e) => {
      const text = e.accumulatedText ?? e.accumulated ?? e.matches?.[0] ?? '';
      if (!text) return;
      transcripts.set(ctx, text);
      ctx.emit('speech.partial', { text });
    }));
    handles.push(await SpeechRecognition.addListener('listeningState', (e) => {
      if (e.state === 'stopped' || e.status === 'stopped') {
        ctx.emit('speech.end', { text: transcripts.get(ctx) ?? '' });
        onStopped?.();
      }
    }));
    return async () => {
      await Promise.allSettled(handles.map((h) => h.remove()));
      if ((await SpeechRecognition.isListening()).listening) await SpeechRecognition.stop();
    };
  });
  const result = await SpeechRecognition.start({
    language: optStr(args, 'language'),
    partialResults: true,
    addPunctuation: true,
    popup: false,
  });
  if (result.matches?.[0]) transcripts.set(ctx, result.matches[0]);
}

async function finish(ctx: CapabilityContext): Promise<string> {
  const last = await SpeechRecognition.getLastPartialResult().catch(() => null);
  await stopWatch(ctx, 'speech');
  return transcripts.get(ctx) || last?.text || '';
}

export const speech: CapabilityGroup = {
  group: 'speech',
  plugin: '@capgo/capacitor-speech-recognition',
  summary: 'speech to text',
  capabilities: [
    {
      name: 'speech.listen',
      signature: "({ language?: 'en-US', maxSeconds?: 1-60, default 15 }?) -> text",
      doc: 'ends on pause or maxSeconds',
      events: ['speech.partial'],
      run: async (args, ctx) => {
        await ready(ctx);
        const maxMs = (optNum(args, 'maxSeconds', { min: 1, max: 60 }) ?? 15) * 1000;
        let done!: () => void;
        const ended = new Promise<void>((resolve) => (done = resolve));
        await begin(ctx, args, () => done());
        await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, maxMs))]);
        return finish(ctx);
      },
    },
    {
      name: 'speech.start',
      signature: "({ language?: 'en-US' }?) -> true",
      doc: 'dictate until speech.stop',
      events: ['speech.partial', 'speech.end'],
      run: async (args, ctx) => {
        await ready(ctx);
        await begin(ctx, args);
        return true;
      },
    },
    {
      name: 'speech.stop',
      signature: '() -> text',
      run: async (_args, ctx) => {
        requireNative(ctx);
        return finish(ctx);
      },
    },
  ],
};
