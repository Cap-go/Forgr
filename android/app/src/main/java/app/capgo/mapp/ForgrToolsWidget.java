package app.capgo.mapp;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import app.capgo.widgetkit.CapgoNativeWidgetBridge;
import app.capgo.widgetkit.CapgoWidgetKitConstants;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home Screen widget. Buttons open a tool with mapp://open?app=… */
public class ForgrToolsWidget extends AppWidgetProvider {

    static final String WIDGET_ID = "forgr-tools";
    private static final int COLS = 4;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) update(context, manager, appWidgetId);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        update(context, manager, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || !CapgoWidgetKitConstants.ACTION_NATIVE_WIDGET_BRIDGE_CHANGED.equals(intent.getAction())) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ForgrToolsWidget.class));
        onUpdate(context, manager, ids);
    }

    private void update(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.forgr_tools_widget);
        JSONObject state = loadState(context);
        String layout = state.optString("layout", "regular");
        if (!layout.equals("open") && !layout.equals("tiny") && !layout.equals("regular") && !layout.equals("big")) layout = "regular";
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        String size = size(options);
        boolean open = layout.equals("open");
        views.setViewVisibility(R.id.open_panel, open ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.grid, open ? View.GONE : View.VISIBLE);
        tint(views, R.id.open_panel, Color.parseColor("#2C2C2E"));
        views.setOnClickPendingIntent(R.id.open_panel, launch(context, appWidgetId, 0, ""));
        if (!open) bindGrid(context, views, appWidgetId, layout, size, state.optJSONArray("tools"));
        manager.updateAppWidget(appWidgetId, views);
    }

    private void bindGrid(Context context, RemoteViews views, int appWidgetId, String layout, String size, JSONArray tools) {
        int count = Math.min(slotCount(layout, size), tools == null ? 0 : tools.length());
        int columns = columns(layout, size);
        int rows = count == 0 ? 1 : (int) Math.ceil(count / (double) columns);
        boolean tiny = layout.equals("tiny");
        float emoji = layout.equals("big") ? 28f : tiny ? 18f : 22f;
        String pkg = context.getPackageName();
        int placed = 0;
        for (int row = 0; row < 3; row++) {
            boolean rowUsed = false;
            for (int col = 0; col < COLS; col++) {
                int index = row * COLS + col;
                int slot = context.getResources().getIdentifier("slot" + index, "id", pkg);
                int emojiId = context.getResources().getIdentifier("emoji" + index, "id", pkg);
                int nameId = context.getResources().getIdentifier("name" + index, "id", pkg);
                boolean cell = col < columns && row < rows && placed < count;
                views.setViewVisibility(slot, cell ? View.VISIBLE : View.GONE);
                if (!cell || tools == null) continue;
                JSONObject tool = tools.optJSONObject(placed);
                placed += 1;
                if (tool == null) continue;
                rowUsed = true;
                String name = tool.optString("name", "Tool");
                views.setTextViewText(emojiId, tool.optString("emoji", "✨"));
                views.setTextViewTextSize(emojiId, android.util.TypedValue.COMPLEX_UNIT_SP, emoji);
                tint(views, emojiId, color(tool.optString("color", "#8E8E93")));
                views.setTextViewText(nameId, name);
                views.setViewVisibility(nameId, tiny ? View.GONE : View.VISIBLE);
                views.setContentDescription(slot, name);
                PendingIntent pending = launch(context, appWidgetId, index + 1, tool.optString("id", ""));
                views.setOnClickPendingIntent(slot, pending);
            }
            int rowId = context.getResources().getIdentifier("row" + row, "id", pkg);
            views.setViewVisibility(rowId, rowUsed ? View.VISIBLE : View.GONE);
        }
    }

    private static void tint(RemoteViews views, int viewId, int color) {
        if (Build.VERSION.SDK_INT >= 31) {
            views.setInt(viewId, "setBackgroundResource", R.drawable.widget_tile);
            views.setColorStateList(viewId, "setBackgroundTintList", ColorStateList.valueOf(color));
        } else {
            views.setInt(viewId, "setBackgroundColor", color);
        }
    }

    private static PendingIntent launch(Context context, int appWidgetId, int slot, String appId) {
        String url = appId == null || appId.isEmpty() ? "mapp://" : "mapp://open?app=" + Uri.encode(appId);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, appWidgetId * 20 + slot, intent, flags);
    }

    private static JSONObject loadState(Context context) {
        try {
            JSONObject session = new CapgoNativeWidgetBridge(context).loadSession(WIDGET_ID);
            if (session == null) return new JSONObject();
            JSONObject state = session.optJSONObject("state");
            return state == null ? new JSONObject() : state;
        } catch (Exception error) {
            return new JSONObject();
        }
    }

    private static String size(Bundle options) {
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        if (width >= 250 && height >= 180) return "large";
        if (width >= 250) return "medium";
        return "small";
    }

    /** Keep in step with slotCount in src/widget/layout.ts. */
    private static int slotCount(String layout, String size) {
        if (layout.equals("tiny")) return size.equals("large") ? 12 : size.equals("medium") ? 8 : 4;
        if (layout.equals("big")) return size.equals("large") ? 4 : size.equals("medium") ? 2 : 1;
        return size.equals("large") ? 6 : size.equals("medium") ? 4 : 2;
    }

    private static int columns(String layout, String size) {
        if (layout.equals("tiny")) return size.equals("small") ? 2 : 4;
        if (layout.equals("big")) return size.equals("small") ? 1 : 2;
        return size.equals("large") ? 3 : size.equals("small") ? 2 : 4;
    }

    private static int color(String hex) {
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException error) {
            return Color.parseColor("#8E8E93");
        }
    }
}
