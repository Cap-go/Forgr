import type { NativeNavigationTabbarOptions } from '@capgo/capacitor-native-navigation';
import type { MiniAppMeta } from '../apps/store';

const TOOL_SYMBOLS: Readonly<Record<string, string>> = {
  Habits: 'checkmark.circle',
  'Tip Split': 'dollarsign.circle',
  Focus: 'timer',
};

export function supportsNativeSidebar(viewport: { width: number; height: number }): boolean {
  return Math.min(viewport.width, viewport.height) >= 600;
}

export function nativeNavigationState(
  apps: readonly Pick<MiniAppMeta, 'id' | 'name'>[],
  currentAppId: string | null,
  hidden: boolean,
  expanded: boolean,
): NativeNavigationTabbarOptions {
  return {
    hidden: hidden || !expanded,
    animated: hidden && expanded,
    selectedId: currentAppId ? `tool:${currentAppId}` : 'home',
    style: { placement: 'sidebar', shape: 'floating' },
    colors: { dynamic: true },
    labelVisibilityMode: 'labeled',
    tabs: [
      { id: 'home', title: 'Home', icon: { ios: { sfSymbol: 'house' } }, selectedIcon: { ios: { sfSymbol: 'house.fill' } } },
      ...apps.map((app) => ({
        id: `tool:${app.id}`,
        title: app.name,
        icon: { ios: { sfSymbol: TOOL_SYMBOLS[app.name] ?? 'app' } },
      })),
      { id: 'settings', title: 'Settings', icon: { ios: { sfSymbol: 'gearshape' } } },
    ],
  };
}
