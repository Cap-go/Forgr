import { accelerometer } from './accelerometer';
import { ai } from './ai';
import { app } from './app';
import { barometer } from './barometer';
import { biometric } from './biometric';
import { calendar } from './calendar';
import { camera } from './camera';
import { clipboard } from './clipboard';
import { cloudGroup, functionsGroup, spacesGroup } from './cloud';
import { compass } from './compass';
import { contacts } from './contacts';
import { datePicker } from './datePicker';
import { device } from './device';
import { flashlight } from './flashlight';
import { geocoder } from './geocoder';
import { haptics } from './haptics';
import { http } from './http';
import { location } from './location';
import { maps } from './maps';
import { notifications } from './notifications';
import { pdf } from './pdf';
import { pedometer } from './pedometer';
import { printer } from './printer';
import { recorder } from './recorder';
import { scanner } from './scanner';
import { screen } from './screen';
import { shake } from './shake';
import { share } from './share';
import { speech } from './speech';
import { storage } from './storage';
import { tts } from './tts';
import type { Capability, CapabilityGroup } from './types';
import { volumeButtons } from './volumeButtons';

export type { Capability, CapabilityContext, CapabilityGroup } from './types';

/** The single source of truth for everything a mini app can call on window.mapp. */
export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  storage,
  ai,
  http,
  app,
  haptics,
  camera,
  location,
  notifications,
  share,
  clipboard,
  device,
  screen,
  flashlight,
  compass,
  accelerometer,
  barometer,
  pedometer,
  shake,
  volumeButtons,
  speech,
  tts,
  recorder,
  biometric,
  geocoder,
  maps,
  datePicker,
  scanner,
  calendar,
  contacts,
  pdf,
  printer,
  cloudGroup,
  spacesGroup,
  functionsGroup,
];

const byName = new Map<string, Capability>(
  CAPABILITY_GROUPS.flatMap((g) => g.capabilities.map((c) => [c.name, c] as const)),
);

export function findCapability(name: string): Capability | undefined {
  return byName.get(name);
}

export function capabilityNames(): string[] {
  return [...byName.keys()];
}

/** Compact markdown listing of every capability, for the AI system prompt. */
export function describeCapabilities(): string {
  return CAPABILITY_GROUPS.map((g) => {
    const lines = g.capabilities.map((c) => {
      let line = `- mapp.${c.name}${c.signature}`;
      if (c.doc) line += `  ${c.doc}`;
      if (c.events?.length) line += `  events: ${c.events.map((e) => `mapp.on('${e}', fn)`).join(', ')}`;
      return line;
    });
    return [`## mapp.${g.group} — ${g.summary} (${g.plugin})`, ...lines].join('\n');
  }).join('\n');
}
