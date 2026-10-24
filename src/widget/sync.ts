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
    const existing = await CapgoWidgetKit.getWidgetSession({ widgetId: WIDGET_ID });
    if (existing.session) {
      await CapgoWidgetKit.updateWidgetSession({ widgetId: WIDGET_ID, state: payload });
    } else {
      await CapgoWidgetKit.startWidgetSession({
        widgetId: WIDGET_ID,
        kind: WIDGET_KIND,
        state: payload,
      });
    }
    await CapgoWidgetKit.reloadWidgets({ kind: WIDGET_KIND });
  } catch {
    // The in-app preview still shows the choice. Native reload can fail off-device.
  }
}

/**
 * Latest tool id a widget button asked to open.
 * `undefined` when nothing is waiting, `''` when the button opens Forgr itself.
 */
/** Unacknowledged widget open, without consuming it. `appId` is `''` when the button opens Forgr. */
export async function peekWidgetLaunch(): Promise<{ appId: string; messageIds: string[] } | undefined> {
  try {
    const { messages } = await CapgoWidgetKit.listWidgetMessages({
      widgetId: WIDGET_ID,
      direction: 'widgetToApp',
      unacknowledgedOnly: true,
    });
    const opens = messages.filter((message) => message.name === 'open').sort((a, b) => a.createdAt - b.createdAt);
    const last = opens.at(-1);
    if (!last) return undefined;
    const appId = last.payload && typeof last.payload.appId === 'string' ? last.payload.appId : '';
    return { appId, messageIds: opens.map((message) => message.messageId) };
  } catch {
    return undefined;
  }
}

export async function acknowledgeWidgetLaunch(messageIds: string[]): Promise<void> {
  if (!messageIds.length) return;
  try {
    await CapgoWidgetKit.acknowledgeWidgetMessages({ messageIds });
  } catch {
    // Leave the message so the next check can open it.
  }
}
