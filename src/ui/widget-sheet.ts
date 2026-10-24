import { h, icon } from './dom';
import {
  buildWidgetState,
  columns,
  LAYOUTS,
  pinLimit,
  pinnedIds,
  setWidgetLayout,
  SIZES,
  toggleWidgetTool,
  visibleTools,
  type WidgetApp,
  type WidgetConfig,
  type WidgetSize,
} from '../widget/layout';

export function buildWidgetSettings(options: {
  apps: WidgetApp[];
  config: WidgetConfig;
  size: WidgetSize;
  onConfig: (config: WidgetConfig, notice?: string) => void;
  onSize: (size: WidgetSize) => void;
}): HTMLElement {
  const { apps, config, size } = options;
  const state = buildWidgetState(config, apps);
  const shown = visibleTools(state, size);
  const layout = LAYOUTS.find((item) => item.id === config.layout) ?? LAYOUTS[0];
  const pinned = new Set(pinnedIds(config, apps));
  const root = h('div', { class: 'widget-settings' });

  const stage = h('div', { class: 'widget-stage' });
  const card = h('div', { class: `widget-card ${size} ${config.layout}${config.layout === 'open' ? ' open-layout' : ''}` });
  if (config.layout === 'open') {
    card.append(h('button', {
      class: 'w-open',
      type: 'button',
      'aria-label': 'Open Forgr',
      onclick: () => options.onConfig(config, 'On your Home Screen this opens Forgr'),
    }, h('strong', {}, 'Forgr'), h('span', {}, 'Open')));
  } else if (!shown.length) {
    card.append(h('p', { class: 'w-empty' }, 'Pin a tool below'));
  } else {
    const cols = columns(config.layout, size);
    card.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    card.style.gridTemplateRows = `repeat(${Math.ceil(shown.length / cols)}, minmax(0, 1fr))`;
    for (const tool of shown) {
      card.append(h('button', {
        class: 'w-btn',
        type: 'button',
        'aria-label': `Open ${tool.name}`,
        onclick: () => options.onConfig(config, `On your Home Screen this opens ${tool.name}`),
      },
      h('span', { class: 'w-emoji', style: `background:${tool.color}` }, tool.emoji),
      h('span', { class: 'w-name' }, tool.name)));
    }
  }
  stage.append(card);

  root.append(
    stage,
    h('div', { class: 'segment', role: 'group', 'aria-label': 'Widget size' },
      ...SIZES.map((item) => h('button', {
        type: 'button',
        class: item.id === size ? 'on' : '',
        'aria-pressed': item.id === size ? 'true' : 'false',
        onclick: () => options.onSize(item.id),
      }, item.label))),
    h('div', { class: 'segment layout', role: 'group', 'aria-label': 'Button layout' },
      ...LAYOUTS.map((item) => h('button', {
        type: 'button',
        class: item.id === config.layout ? 'on' : '',
        'aria-pressed': item.id === config.layout ? 'true' : 'false',
        onclick: () => options.onConfig(setWidgetLayout(config, item.id)),
      }, item.label))),
    h('p', { class: 'group-footer' }, layout.detail),
  );

  if (config.layout !== 'open') {
    const cap = pinLimit(config.layout);
    root.append(h('div', { class: 'section-label' }, `Tools · ${pinned.size}/${cap}`));
    const group = h('div', { class: 'group' });
    if (!apps.length) {
      group.append(h('div', { class: 'row' }, h('span', { class: 'row-sub' }, 'Make a tool first, then pin it here.')));
    }
    const ordered = [
      ...pinnedIds(config, apps).flatMap((id) => {
        const app = apps.find((item) => item.id === id);
        return app ? [app] : [];
      }),
      ...apps.filter((app) => !pinned.has(app.id)),
    ];
    for (const app of ordered) {
      const on = pinned.has(app.id);
      group.append(h('button', {
        class: 'row',
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          const next = toggleWidgetTool(config, apps, app.id);
          options.onConfig(next.config, next.full ? `${layout.label} holds ${cap} tools` : undefined);
        },
      },
      h('span', { class: 'tile small', style: `--tile:${app.color}` }, app.emoji),
      h('span', { class: 'row-title' }, app.name),
      on ? icon('check', 'icon row-icon on') : h('span', { class: 'row-icon' })));
    }
    root.append(group);
  }

  root.append(h('p', { class: 'group-footer' },
    'Touch and hold the Home Screen, tap +, then Forgr. Small, medium and large are all there. Each button opens that tool.'));
  return root;
}
