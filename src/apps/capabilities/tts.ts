import { SpeechSynthesis } from '@capgo/capacitor-speech-synthesis';
import type { CapabilityContext, CapabilityGroup } from './types';
import { obj, optNum, optStr, requireNative, str } from './util';

const cleanup = new WeakSet<CapabilityContext>();

export const tts: CapabilityGroup = {
  group: 'tts',
  plugin: '@capgo/capacitor-speech-synthesis',
  summary: 'text to speech',
  capabilities: [
    {
      name: 'tts.speak',
      params: ['text', 'options'],
      signature: "(text, { language?: 'fr-FR', rate?: 0.1-2 (1 normal), pitch?: 0.5-2, volume?: 0-1 }?) -> true",
      doc: 'interrupts previous speech',
      run: async (args, ctx) => {
        requireNative(ctx);
        const text = str(args, 'text');
        const o = obj(args, 'options');
        if (!cleanup.has(ctx)) {
          cleanup.add(ctx);
          ctx.onDispose(() => SpeechSynthesis.cancel());
        }
        await SpeechSynthesis.speak({
          text: text.slice(0, 4000),
          language: optStr(o, 'language'),
          rate: optNum(o, 'rate', { min: 0.1, max: 2 }),
          pitch: optNum(o, 'pitch', { min: 0.5, max: 2 }),
          volume: optNum(o, 'volume', { min: 0, max: 1 }),
          queueStrategy: 'Flush',
        });
        return true;
      },
    },
    {
      name: 'tts.stop',
      signature: '() -> true',
      run: async (_args, ctx) => {
        requireNative(ctx);
        await SpeechSynthesis.cancel();
        return true;
      },
    },
    {
      name: 'tts.isSpeaking',
      signature: '() -> boolean',
      run: async (_args, ctx) => ctx.native && (await SpeechSynthesis.isSpeaking()).isSpeaking,
    },
  ],
};
