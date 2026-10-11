import { Device } from '@capacitor/device';
import { DeviceInfo } from '@capgo/capacitor-device-info';
import type { CapabilityGroup } from './types';

export const device: CapabilityGroup = {
  group: 'device',
  plugin: '@capacitor/device + @capgo/capacitor-device-info',
  summary: 'phone model, OS, battery, language, storage',
  capabilities: [
    {
      name: 'device.info',
      signature: '() -> { model, platform, osVersion, manufacturer, name?, isVirtual }',
      run: async () => {
        const info = await Device.getInfo();
        return {
          model: info.model,
          platform: info.platform,
          osVersion: info.osVersion,
          manufacturer: info.manufacturer,
          name: info.name ?? null,
          isVirtual: info.isVirtual,
        };
      },
    },
    {
      name: 'device.battery',
      signature: '() -> { level: 0-1|null, charging: boolean|null }',
      run: async () => {
        const b = await Device.getBatteryInfo();
        return { level: b.batteryLevel ?? null, charging: b.isCharging ?? null };
      },
    },
    {
      name: 'device.language',
      signature: "() -> { code: 'en', tag: 'en-US' }",
      run: async () => ({ code: (await Device.getLanguageCode()).value, tag: (await Device.getLanguageTag()).value }),
    },
    {
      name: 'device.stats',
      signature: "() -> { storage: { totalBytes, freeBytes, usedPercent }, memory: { totalBytes, appUsedBytes, usedPercent }, cpuCores, thermalState, lowPowerMode }",
      run: async (_args, ctx) => {
        if (!ctx.native) throw new Error('Only available on iPhone');
        const s = await DeviceInfo.getInfo();
        return {
          storage: { totalBytes: s.storage.totalBytes ?? null, freeBytes: s.storage.freeBytes ?? null, usedPercent: s.storage.usedPercent ?? null },
          memory: { totalBytes: s.memory.totalBytes ?? null, appUsedBytes: s.memory.appUsedBytes ?? null, usedPercent: s.memory.usedPercent ?? null },
          cpuCores: s.cpu.cores,
          thermalState: s.thermalState ?? 'unknown',
          lowPowerMode: s.lowPowerMode ?? null,
        };
      },
    },
  ],
};
