package com.forestdept.eravat;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    private ConnectivityManager.NetworkCallback networkCallback;
    private static final String PREFS = "eravat_native_prefs";
    private static final String KEY_LAST_VERSION_CODE = "last_version_code";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        purgeStaleWebViewCachesIfVersionChanged();
        super.onCreate(savedInstanceState);
        configureWebView();
        registerNetworkCallback();
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebView();
        injectLegacyPinCleanup();
    }

    @Override
    public void onResume() {
        super.onResume();
        dispatchJsEvent("eravat-app-resume");
    }

    @Override
    public void onDestroy() {
        unregisterNetworkCallback();
        super.onDestroy();
    }

    /**
     * After uninstall/reinstall, Android Auto Backup can restore app_webview data
     * (Service Worker + Cache Storage) from PIN-era builds. When the installed
     * versionCode changes, clear only SW/HTTP caches so APK assets win — keep
     * Local Storage + IndexedDB (auth session + offline Dexie queues).
     */
    private void purgeStaleWebViewCachesIfVersionChanged() {
        long versionCode = readVersionCode();
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long previous = prefs.getLong(KEY_LAST_VERSION_CODE, -1L);
        if (previous == versionCode) {
            return;
        }

        // Targeted wipe: never delete Local Storage / IndexedDB here.
        File webViewRoot = new File(getApplicationInfo().dataDir, "app_webview");
        deleteRecursive(new File(webViewRoot, "Default/Service Worker"));
        deleteRecursive(new File(webViewRoot, "Default/Cache"));
        deleteRecursive(new File(webViewRoot, "Default/Code Cache"));
        deleteRecursive(new File(webViewRoot, "Default/GPUCache"));
        deleteRecursive(new File(getCacheDir(), "WebView"));

        prefs.edit().putLong(KEY_LAST_VERSION_CODE, versionCode).apply();
    }

    private long readVersionCode() {
        try {
            PackageManager pm = getPackageManager();
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = pm.getPackageInfo(getPackageName(), PackageManager.PackageInfoFlags.of(0));
            } else {
                info = pm.getPackageInfo(getPackageName(), 0);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (Exception e) {
            return 0L;
        }
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private void configureWebView() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        webView.clearCache(true);
    }

    /** Drop legacy PIN blob keys if a restored localStorage still has them. */
    private void injectLegacyPinCleanup() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        String script =
            "(function(){try{"
                + "localStorage.removeItem('eravat_secure_session');"
                + "localStorage.removeItem('eravat_bypass_pin_lock');"
                + "if('serviceWorker' in navigator){"
                + "navigator.serviceWorker.getRegistrations().then(function(r){"
                + "r.forEach(function(x){x.unregister();});});}"
                + "if(window.caches&&caches.keys){caches.keys().then(function(k){"
                + "k.forEach(function(n){caches.delete(n);});});}"
                + "}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void registerNetworkCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return;
        }
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm == null) {
            return;
        }
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                dispatchJsEvent("eravat-network-online");
            }
        };
        NetworkRequest request = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();
        cm.registerNetworkCallback(request, networkCallback);
    }

    private void unregisterNetworkCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || networkCallback == null) {
            return;
        }
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm != null) {
            cm.unregisterNetworkCallback(networkCallback);
        }
        networkCallback = null;
    }

    private void dispatchJsEvent(String eventName) {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new Event('" + eventName + "'));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
