import { Filesystem } from '@capacitor/filesystem';
import { CapacitorAudioRecorder, RecordingStatus } from '@capgo/capacitor-audio-recorder';
import type { CapabilityContext, CapabilityGroup } from './types';
import { blobToDataUrl, ensureGranted, fileToDataUrl, requireNative } from './util';

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
      signature: "() -> { dataUrl: 'data:audio/mp4;base64,...', durationMs }",
      doc: 'plays in <audio>; max 8 MB',
      run: async (_args, ctx) => {
        requireNative(ctx);
        const result = await CapacitorAudioRecorder.stopRecording();
        let dataUrl: string;
        if (result.uri) {
          try {
            dataUrl = await fileToDataUrl(result.uri, 'audio/mp4');
          } finally {
            await Filesystem.deleteFile({ path: result.uri }).catch(() => undefined);
          }
        } else if (result.blob) {
          dataUrl = await blobToDataUrl(result.blob);
        } else {
          throw new Error('Recording produced no audio');
        }
        return { dataUrl, durationMs: result.duration ?? null };
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
