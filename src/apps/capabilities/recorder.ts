import { CapacitorAudioRecorder, RecordingStatus } from '@capgo/capacitor-audio-recorder';
import { adoptFile, writeMedia } from '../media';
import type { CapabilityContext, CapabilityGroup } from './types';
import { blobToDataUrl, ensureGranted, requireNative } from './util';

const recording = new WeakSet<CapabilityContext>();

export const recorder: CapabilityGroup = {
  group: 'recorder',
  plugin: '@capgo/capacitor-audio-recorder',
  summary: 'microphone recording',
  capabilities: [
    {
      name: 'recorder.start',
      signature: '() -> true',
      doc: 'asks mic permission',
      run: async (_args, ctx) => {
        requireNative(ctx);
        const perm = await CapacitorAudioRecorder.checkPermissions();
        if (perm.recordAudio !== 'granted') ensureGranted((await CapacitorAudioRecorder.requestPermissions()).recordAudio, 'Microphone');
        if ((await CapacitorAudioRecorder.getRecordingStatus()).status !== RecordingStatus.Inactive) {
          await CapacitorAudioRecorder.cancelRecording();
        }
        await CapacitorAudioRecorder.startRecording();
        if (!recording.has(ctx)) {
          recording.add(ctx);
          ctx.onDispose(async () => {
            if ((await CapacitorAudioRecorder.getRecordingStatus()).status !== RecordingStatus.Inactive) {
              await CapacitorAudioRecorder.cancelRecording();
            }
          });
        }
        return true;
      },
    },
    {
      name: 'recorder.stop',
      signature: '() -> { path, url, mimeType, size, durationMs }',
      doc: "Saved in the app's files (m4a). Play with <audio src=url>; send to transcription with mapp.http.upload(url, { file: path }).",
      run: async (_args, ctx) => {
        requireNative(ctx);
        const result = await CapacitorAudioRecorder.stopRecording();
        let file;
        if (result.uri) {
          file = await adoptFile(ctx.app.id, result.uri, 'audio/mp4');
        } else if (result.blob) {
          const dataUrl = await blobToDataUrl(result.blob);
          file = await writeMedia(ctx.app.id, { base64: dataUrl.replace(/^data:[^,]*,/, ''), mimeType: 'audio/mp4' });
        } else {
          throw new Error('Recording produced no audio');
        }
        return { ...file, durationMs: result.duration ?? null };
      },
    },
    {
      name: 'recorder.cancel',
      signature: '() -> true',
      run: async (_args, ctx) => {
        requireNative(ctx);
        await CapacitorAudioRecorder.cancelRecording();
        return true;
      },
    },
  ],
};
