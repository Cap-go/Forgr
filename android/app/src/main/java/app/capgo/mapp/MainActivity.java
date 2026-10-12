package app.capgo.mapp;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        paintSystemBarArea(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        paintSystemBarArea(newConfig);
    }

    /**
     * On WebViews older than 140 Capacitor pads the WebView instead of drawing
     * under the system bars; paint that strip with the app background.
     */
    private void paintSystemBarArea(Configuration config) {
        boolean dark = (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        getWindow().getDecorView().setBackgroundColor(dark ? Color.BLACK : Color.parseColor("#F2F2F7"));
    }
}
