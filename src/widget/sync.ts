import { CapgoWidgetKit, type JsonObject } from '@capgo/capacitor-widget-kit';
import { buildWidgetState, loadWidgetConfig, WIDGET_ID, WIDGET_KIND, type WidgetApp } from './layout';

/** Writes the pinned tools into the widget kit store and asks the Home Screen to reload. */
export async function syncWidget(apps: WidgetApp[]): Promise<void> {
  try {
    const state = buildWidgetState(loadWidgetConfig(), apps);
    const tools: JsonObject[] = state.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      emoji: tool.emoji,
      color: tool.color,
    }));
    const payload: JsonObject = { layout: state.layout, tools };
    await CapgoWidgetKit.startWidgetSession({
      widgetId: WIDGET_ID,
      kind: WIDGET_KIND,
      state: payload,
    });
    await CapgoWidgetKit.reloadWidgets({ kind: WIDGET_KIND });
  } catch {
    // The in-app preview still shows the choice. Native reload can fail off-device.
  }
}

/**
 * Latest tool id a widget button asked to open.
 * `undefined` when nothing is waiting, `''` when the button opens Forgr itself.
 */
export async function takeWidgetLaunch(): Promise<string | null | undefined> {
  try {
    const { messages } = await CapgoWidgetKit.listWidgetMessages({
      widgetId: WIDGET_ID,
      direction: 'widgetToApp',
      unacknowledgedOnly: true,
    });
    const opens = messages.filter((message) => message.name === 'open').sort((a, b) => a.createdAt - b.createdAt);
    const last = opens.at(-1);
    if (!last) return undefined;
    await CapgoWidgetKit.acknowledgeWidgetMessages({ messageIds: opens.map((message) => message.messageId) });
    const appId = last.payload && typeof last.payload.appId === 'string' ? last.payload.appId : '';
    return appId;
  } catch {
    return undefined;
  }
}
