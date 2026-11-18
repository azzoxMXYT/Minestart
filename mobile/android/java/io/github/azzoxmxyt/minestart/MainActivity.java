package io.github.azzoxmxyt.minestart;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Runs the bundled game; no network or storage permissions, JS bridges, or external URLs. */
public final class MainActivity extends Activity {
    private static final int BACKGROUND = 0xff131610;
    // A stable HTTPS base URL gives localStorage an origin without making a network request.
    private static final String GAME_URL = "https://appassets.androidplatform.net/minestart/index.html";
    private WebView game;
    private FrameLayout root;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        game = new WebView(this);
        game.setBackgroundColor(BACKGROUND);
        game.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        game.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked",
                        null, new ByteArrayInputStream(new byte[0]));
            }
        });
        if (Build.VERSION.SDK_INT >= 30) {
            // Keep WebView content clear of cutouts, system bars, and the on-screen keyboard.
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets padding = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        root.addView(game, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        game.loadDataWithBaseURL(GAME_URL, bundledPage(), "text/html", "UTF-8", GAME_URL);
    }

    private String bundledPage() {
        try (InputStream input = getAssets().open("index.html");
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) bytes.write(buffer, 0, length);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            return "<meta charset=utf-8><title>Minestart</title>Impossible d’ouvrir le jeu. Réinstalle Minestart.";
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (game != null) game.onResume();
    }

    @Override
    protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("window.dispatchEvent(new Event('minestart:pause'))", null);
            game.onPause();
        }
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (game == null) { finish(); return; }
        game.evaluateJavascript("window.dispatchEvent(new Event('minestart:back',{cancelable:true}))",
                unhandled -> { if (!"false".equals(unhandled)) finish(); });
    }

    @Override
    protected void onDestroy() {
        if (game != null) {
            root.removeView(game);
            game.destroy();
            game = null;
        }
        super.onDestroy();
    }
}
