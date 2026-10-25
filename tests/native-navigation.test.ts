import { describe, expect, test } from 'bun:test';
import { nativeNavigationState } from '../src/ui/native-navigation-state';

describe('native navigation', () => {
  const apps = [{ id: 'home', name: 'Habits' }, { id: 'settings', name: 'Tip Split' }];

  test('uses system-adaptive placement and preserves distinct tool ids', () => {
    const state = nativeNavigationState(apps, 'home', false);
    expect(state.style?.placement).toBe('auto');
    expect(state.selectedId).toBe('tool:home');
    expect(state.tabs?.map((tab) => tab.id)).toEqual(['home', 'tool:home', 'tool:settings', 'settings']);
    expect(state.tabs?.map((tab) => tab.title)).toEqual(['Home', 'Habits', 'Tip Split', 'Settings']);
  });

  test('keeps Home selected with no open tool and hides beneath overlays', () => {
    const state = nativeNavigationState([], null, true);
    expect(state.selectedId).toBe('home');
    expect(state.hidden).toBe(true);
    expect(state.animated).toBe(true);
    expect(state.tabs?.map((tab) => tab.id)).toEqual(['home', 'settings']);
  });
});
