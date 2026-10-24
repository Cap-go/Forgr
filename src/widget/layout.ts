/** Home Screen widget: which tools are pinned, and how big the buttons are. */

export const WIDGET_ID = 'forgr-tools';
export const WIDGET_KIND = 'ForgrToolsWidget';
export const HOME_URL = 'mapp://';

export type WidgetLayout = 'open' | 'tiny' | 'regular' | 'big';
export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetApp {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface WidgetConfig {
  layout: WidgetLayout;
  /** Null uses the most recent tools, up to the large-widget capacity. */
  toolIds: string[] | null;
}

export interface WidgetState {
  layout: WidgetLayout;
  tools: WidgetApp[];
}

export const LAYOUTS: { id: WidgetLayout; label: string; detail: string }[] = [
  { id: 'open', label: 'Open', detail: 'One button. A tap opens Forgr.' },
  { id: 'tiny', label: 'Tiny', detail: 'Emoji only, so more tools fit.' },
  { id: 'regular', label: 'Regular', detail: 'Emoji and the name.' },
  { id: 'big', label: 'Big', detail: 'Fewer tools, larger buttons.' },
];

export const SIZES: { id: WidgetSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

const SLOTS: Record<Exclude<WidgetLayout, 'open'>, Record<WidgetSize, number>> = {
  tiny: { small: 4, medium: 8, large: 12 },
  regular: { small: 2, medium: 4, large: 6 },
  big: { small: 1, medium: 2, large: 4 },
};

const COLUMNS: Record<Exclude<WidgetLayout, 'open'>, Record<WidgetSize, number>> = {
  tiny: { small: 2, medium: 4, large: 4 },
  regular: { small: 2, medium: 4, large: 3 },
  big: { small: 1, medium: 2, large: 2 },
};

const STORAGE_KEY = 'forgr_widget_v1';

export function toolUrl(id: string): string {
  return `mapp://open?app=${encodeURIComponent(id)}`;
}

export function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === 'open' || value === 'tiny' || value === 'regular' || value === 'big';
}

export function slotCount(layout: WidgetLayout, size: WidgetSize): number {
  if (layout === 'open') return 1;
  return SLOTS[layout][size];
}

export function columns(layout: WidgetLayout, size: WidgetSize): number {
  if (layout === 'open') return 1;
  return COLUMNS[layout][size];
}

/** How many tools the largest widget of this layout can show. */
export function pinLimit(layout: WidgetLayout): number {
  return layout === 'open' ? 0 : slotCount(layout, 'large');
}

export function defaultWidgetConfig(): WidgetConfig {
  return { layout: 'regular', toolIds: null };
}

export function loadWidgetConfig(): WidgetConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWidgetConfig();
    const parsed = JSON.parse(raw) as { layout?: unknown; toolIds?: unknown };
    const toolIds = Array.isArray(parsed.toolIds) ? parsed.toolIds.filter((id): id is string => typeof id === 'string') : null;
    return { layout: isWidgetLayout(parsed.layout) ? parsed.layout : 'regular', toolIds };
  } catch {
    return defaultWidgetConfig();
  }
}

export function saveWidgetConfig(config: WidgetConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function setWidgetLayout(config: WidgetConfig, layout: WidgetLayout): WidgetConfig {
  if (layout === 'open' || !config.toolIds) return { ...config, layout };
  return { layout, toolIds: config.toolIds.slice(0, pinLimit(layout)) };
}

/** Pins or unpins a tool. `full` means the layout already holds its maximum. */
export function toggleWidgetTool(config: WidgetConfig, apps: WidgetApp[], id: string): { config: WidgetConfig; full: boolean } {
  const cap = pinLimit(config.layout);
  const current = config.toolIds ?? apps.map((app) => app.id).slice(0, cap);
  if (current.includes(id)) return { config: { ...config, toolIds: current.filter((item) => item !== id) }, full: false };
  if (current.length >= cap) return { config, full: true };
  return { config: { ...config, toolIds: [...current, id] }, full: false };
}

export function pinnedIds(config: WidgetConfig, apps: WidgetApp[]): string[] {
  const cap = pinLimit(config.layout);
  if (config.layout === 'open') return [];
  return (config.toolIds ?? apps.map((app) => app.id)).filter((id) => apps.some((app) => app.id === id)).slice(0, cap);
}

export function buildWidgetState(config: WidgetConfig, apps: WidgetApp[]): WidgetState {
  const ids = pinnedIds(config, apps);
  const tools = ids.flatMap((id) => {
    const app = apps.find((item) => item.id === id);
    return app ? [{ id: app.id, name: app.name, emoji: app.emoji, color: app.color }] : [];
  });
  return { layout: config.layout, tools };
}

/** Tools visible at one Home Screen size, in pin order. */
export function visibleTools(state: WidgetState, size: WidgetSize): WidgetApp[] {
  if (state.layout === 'open') return [];
  return state.tools.slice(0, slotCount(state.layout, size));
}
