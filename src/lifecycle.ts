import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type Listener = (active: boolean) => void;

/** Foreground/background state of Mapp (app switcher, lock screen, calls). */
class Lifecycle {
  private active = true;
  private lastBackgroundAt = 0;
  private listeners = new Set<Listener>();
  private waiters: Array<() => void> = [];

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => this.set(isActive));
    }
    document.addEventListener('visibilitychange', () => this.set(document.visibilityState === 'visible'));
  }

  get isActive(): boolean {
    return this.active;
  }

  /** True when Mapp went to the background at or after `sinceMs`. */
  backgroundedSince(sinceMs: number): boolean {
    return !this.active || this.lastBackgroundAt >= sinceMs;
  }

  /** Resolves when Mapp is in the foreground (immediately if it already is). */
  whenActive(): Promise<void> {
    return this.active ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (!active) this.lastBackgroundAt = Date.now();
    else {
      const waiters = this.waiters;
      this.waiters = [];
      waiters.forEach((resolve) => resolve());
    }
    this.listeners.forEach((fn) => fn(active));
  }
}

export const lifecycle = new Lifecycle();
