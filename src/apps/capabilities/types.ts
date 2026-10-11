import type { MiniAppMeta } from '../store';

/** What a capability handler can use while serving one mini app. */
export interface CapabilityContext {
  app: MiniAppMeta;
  native: boolean;
  /** Push an event to the mini app: received with mapp.on(event, fn). */
  emit(event: string, payload: unknown): void;
  /** Cleanup run when the app closes (stop watchers, remove listeners). */
  onDispose(fn: () => void | Promise<void>): void;
  /** Shell actions. */
  host: {
    goHome(): void;
    openEditor(prompt?: string): void;
    /** Secure entry sheet over the app; the value goes straight to the Keychain. */
    requestSecret(spec: { name: string; label: string; kind: import('../../secrets').SecretKind; username?: string; appName: string }): Promise<{ saved: boolean }>;
  };
}

/**
 * One callable feature exposed to mini apps as window.mapp.<group>.<method>(args).
 * `name` is "<group>.<method>", e.g. "compass.getHeading".
 */
export interface Capability {
  name: string;
  /** One line signature + return shape shown to the AI, e.g. "() -> { heading: degrees 0-360 }". */
  signature: string;
  /** Short usage notes for the AI: permissions, units, limits. */
  doc?: string;
  /**
   * Positional argument names: mapp.storage.set(key, value) -> { key, value }.
   * Without params the first argument (object or undefined) is passed as args.
   */
  params?: string[];
  /** Events this capability emits through ctx.emit, e.g. ["compass.heading"]. */
  events?: string[];
  run(args: Record<string, unknown>, ctx: CapabilityContext): Promise<unknown>;
}

export interface CapabilityGroup {
  /** Namespace on window.mapp, e.g. "compass". */
  group: string;
  /** Which plugin powers it, e.g. "@capgo/capacitor-compass". */
  plugin: string;
  /** What users can build with it, shown to the AI. */
  summary: string;
  capabilities: Capability[];
}
