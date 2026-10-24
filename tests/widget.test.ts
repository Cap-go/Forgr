import { describe, expect, test } from 'bun:test';
import { parseLink } from '../src/links';
import {
  buildWidgetState,
  columns,
  defaultWidgetConfig,
  HOME_URL,
  pinLimit,
  setWidgetLayout,
  slotCount,
  toggleWidgetTool,
  toolUrl,
  visibleTools,
  type WidgetApp,
  type WidgetConfig,
} from '../src/widget/layout';

const apps: WidgetApp[] = [
  { id: 'habits', name: 'Habits', emoji: '✅', color: '#34c759' },
  { id: 'tips', name: 'Tips', emoji: '💸', color: '#ff9500' },
  { id: 'focus', name: 'Focus', emoji: '⏳', color: '#5856d6' },
  { id: 'plants', name: 'Plants', emoji: '🌱', color: '#30d158' },
  { id: 'water', name: 'Water', emoji: '💧', color: '#64d2ff' },
];

describe('widget layout', () => {
  test('slot counts', () => {
    expect(slotCount('open', 'large')).toBe(1);
    expect(slotCount('tiny', 'small')).toBe(4);
    expect(slotCount('tiny', 'medium')).toBe(8);
    expect(slotCount('tiny', 'large')).toBe(12);
    expect(slotCount('regular', 'small')).toBe(2);
    expect(slotCount('regular', 'medium')).toBe(4);
    expect(slotCount('regular', 'large')).toBe(6);
    expect(slotCount('big', 'small')).toBe(1);
    expect(slotCount('big', 'medium')).toBe(2);
    expect(slotCount('big', 'large')).toBe(4);
    expect(columns('tiny', 'small')).toBe(2);
    expect(columns('tiny', 'medium')).toBe(4);
    expect(columns('regular', 'large')).toBe(3);
    expect(columns('big', 'small')).toBe(1);
    expect(pinLimit('big')).toBe(4);
    expect(pinLimit('open')).toBe(0);
  });

  test('auto pins the newest tools and trims when the layout gets bigger buttons', () => {
    const config = defaultWidgetConfig();
    expect(buildWidgetState(config, apps).tools.map((tool) => tool.id)).toEqual(['habits', 'tips', 'focus', 'plants', 'water']);
    const big = setWidgetLayout(config, 'big');
    expect(visibleTools(buildWidgetState(big, apps), 'medium').map((tool) => tool.id)).toEqual(['habits', 'tips']);
    expect(visibleTools(buildWidgetState(big, apps), 'small')).toHaveLength(1);
  });

  test('pin order and the full state', () => {
    let config: WidgetConfig = { layout: 'regular', toolIds: [] };
    config = toggleWidgetTool(config, apps, 'tips').config;
    config = toggleWidgetTool(config, apps, 'plants').config;
    expect(config.toolIds).toEqual(['tips', 'plants']);
    const big = setWidgetLayout({ layout: 'regular', toolIds: ['tips', 'focus', 'plants', 'water', 'habits'] }, 'big');
    expect(big.toolIds).toEqual(['tips', 'focus', 'plants', 'water']);
    const overflow = toggleWidgetTool(big, apps, 'habits');
    expect(overflow.full).toBe(true);
    expect(overflow.config.toolIds).toEqual(['tips', 'focus', 'plants', 'water']);
  });

  test('open layout has no tool buttons, and tool urls open that tool', () => {
    const state = buildWidgetState(setWidgetLayout(defaultWidgetConfig(), 'open'), apps);
    expect(state.tools).toEqual([]);
    expect(parseLink(HOME_URL)).toEqual({ action: 'home' });
    expect(parseLink(toolUrl('Habits'))).toEqual({ action: 'open', app: 'Habits' });
    expect(parseLink(toolUrl('a b'))).toEqual({ action: 'open', app: 'a b' });
  });
});
