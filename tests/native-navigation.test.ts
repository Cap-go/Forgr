import { describe, expect, test } from 'bun:test';
import { nativeNavigationState, supportsNativeSidebar } from '../src/ui/native-navigation-state';

describe('native navigation', () => {
  const apps = [{ id: 'home', name: 'Habits' }, { id: 'settings', name: 'Tip Split' }];

  test('uses sidebar placement on expanded layouts and preserves distinct tool ids', () => {
    const state = nativeNavigationState(apps, 'home', false, true);
    expect(state.style?.placement).toBe('sidebar');
    expect(state.hidden).toBe(false);
    expect(state.animated).toBe(false);
    expect(state.selectedId).toBe('tool:home');
    expect(state.tabs?.map((tab) => tab.id)).toEqual(['home', 'tool:home', 'tool:settings', 'settings']);
    expect(state.tabs?.map((tab) => tab.title)).toEqual(['Home', 'Habits', 'Tip Split', 'Settings']);
  });

  test('keeps Home selected with no open tool and hides beneath overlays', () => {
    const state = nativeNavigationState([], null, true, true);
    expect(state.selectedId).toBe('home');
    expect(state.hidden).toBe(true);
    expect(state.animated).toBe(true);
    expect(state.tabs?.map((tab) => tab.id)).toEqual(['home', 'settings']);
  });

  test.each([
    { width: 393, height: 852 },
    { width: 440, height: 956 },
    { width: 956, height: 440 },
    { width: 466, height: 678 },
  ])('never shows native bars on compact screens: %j', (viewport) => {
    const state = nativeNavigationState(apps, null, false, supportsNativeSidebar(viewport));
    expect(state.hidden).toBe(true);
    expect(state.animated).toBe(false);
  });

  test.each([{ width: 951, height: 669 }, { width: 669, height: 951 }])('keeps the sidebar on an unfolded Duo: %j', (viewport) => {
    expect(supportsNativeSidebar(viewport)).toBe(true);
    expect(nativeNavigationState(apps, 'home', false, true).hidden).toBe(false);
  });

  test('folding removes native chrome immediately and unfolding restores it', () => {
    const stateFor = (viewport: { width: number; height: number }) =>
      nativeNavigationState(apps, 'home', false, supportsNativeSidebar(viewport));
    expect(stateFor({ width: 951, height: 669 }).hidden).toBe(false);
    expect(stateFor({ width: 466, height: 678 }).hidden).toBe(true);
    expect(stateFor({ width: 951, height: 669 }).selectedId).toBe('tool:home');
  });
});
