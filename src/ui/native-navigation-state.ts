import type { NativeNavigationTabbarOptions } from '@capgo/capacitor-native-navigation';
import type { MiniAppMeta } from '../apps/store';

const TOOL_SYMBOLS: Readonly<Record<string, string>> = {
  Habits: 'checkmark.circle',
  'Tip Split': 'dollarsign.circle',
  Focus: 'timer',
};

export function nativeNavigationState(
  apps: readonly Pick<MiniAppMeta, 'id' | 'name'>[],
  currentAppId: string | null,
  hidden: boolean,
): NativeNavigationTabbarOptions {
  return {
    hidden,
    animated: true,
    selectedId: currentAppId ? `tool:${currentAppId}` : 'home',
    style: { placement: 'auto', shape: 'floating' },
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
