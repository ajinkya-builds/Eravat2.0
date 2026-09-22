package com.forestdept.eravat;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import android.Manifest;

@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> locationSettingsLauncher;
    private PluginCall pendingEnsureCall;
    private BroadcastReceiver providerReceiver;
    private final List<LocationListener> freshFixListeners = new ArrayList<>();
    private Handler freshFixHandler;

    @Override
    public void load() {
        super.load();
        Activity rawActivity = getActivity();
        if (rawActivity instanceof ComponentActivity) {
            locationSettingsLauncher = ((ComponentActivity) rawActivity).registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                result -> resolveEnsureCall(result.getResultCode() == Activity.RESULT_OK || isLocationEnabled())
            );
        }
        registerProviderReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager != null) stopFreshFixUpdates(manager);
        if (providerReceiver != null) {
            try {
                getContext().unregisterReceiver(providerReceiver);
            } catch (Exception ignored) {
                // already unregistered
            }
            providerReceiver = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", isLocationEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void ensureEnabled(PluginCall call) {
        if (isLocationEnabled()) {
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            openLocationSourceSettings(call);
            return;
        }

        try {
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
                .setMinUpdateIntervalMillis(2000L)
                .build();
            LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
                .addLocationRequest(request)
                .setAlwaysShow(true)
                .build();

            LocationServices.getSettingsClient(activity)
                .checkLocationSettings(settingsRequest)
                .addOnSuccessListener(response -> {
                    JSObject ret = new JSObject();
                    ret.put("enabled", true);
                    call.resolve(ret);
                })
                    .addOnFailureListener(e -> {
                    if (e instanceof ResolvableApiException && locationSettingsLauncher != null) {
                        try {
                            pendingEnsureCall = call;
                            call.setKeepAlive(true);
                            IntentSenderRequest senderRequest = new IntentSenderRequest.Builder(
                                ((ResolvableApiException) e).getResolution()
                            ).build();
                            locationSettingsLauncher.launch(senderRequest);
                        } catch (Exception launchError) {
                            openLocationSourceSettings(call);
                        }
                    } else {
                        openLocationSourceSettings(call);
                    }
                });
        } catch (Exception e) {
            openLocationSourceSettings(call);
        }
    }

    @PluginMethod
    public void getLastKnown(PluginCall call) {
        call.resolve(locationToJs(readBestLastKnown()));
    }

    /**
     * Ask LocationManager for a live GPS fix. Network/cell is collected in
     * parallel but is only returned after the GPS wait expires (or immediately
     * if the GPS provider is off). Never returns getLastKnown.
     */
    @PluginMethod
    public void requestFreshFix(PluginCall call) {
        if (!hasLocationPermission()) {
            call.resolve(new JSObject());
            return;
        }
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            call.resolve(new JSObject());
            return;
        }

        Integer timeout = call.getInt("timeoutMs", 15_000);
        int timeoutMs = timeout != null ? timeout : 15_000;
        call.setKeepAlive(true);
        stopFreshFixUpdates(manager);

        AtomicBoolean done = new AtomicBoolean(false);
        if (freshFixHandler == null) {
            freshFixHandler = new Handler(Looper.getMainLooper());
        }

        AtomicReference<Location> liveCell = new AtomicReference<>();

        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (location == null) return;
                // Satellite GPS only auto-wins. Cell/network is held until the GPS wait expires.
                if (LocationManager.GPS_PROVIDER.equals(location.getProvider())) {
                    if (!done.compareAndSet(false, true)) return;
                    if (freshFixHandler != null) freshFixHandler.removeCallbacksAndMessages(null);
                    stopFreshFixUpdates(manager);
                    call.resolve(locationToJs(location));
                    return;
                }
                Location previous = liveCell.get();
                if (previous == null
                    || (location.hasAccuracy()
                        && (!previous.hasAccuracy() || location.getAccuracy() < previous.getAccuracy()))) {
                    liveCell.set(location);
                }
            }
        };
        freshFixListeners.add(listener);

        boolean registered = false;
        String[] providers = new String[] {
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER
        };
        for (String provider : providers) {
            try {
                if (!manager.isProviderEnabled(provider)) continue;
                // Live updates only — getCurrentLocation/getLastKnown can return a stale cache.
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
                registered = true;
            } catch (SecurityException ignored) {
                // permission revoked mid-request
            } catch (IllegalArgumentException ignored) {
                // provider missing on this device
            }
        }

        if (!registered) {
            done.set(true);
            call.resolve(new JSObject());
            return;
        }

        boolean gpsEnabled = false;
        try {
            gpsEnabled = manager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception ignored) {
            // treat as GPS unavailable
        }
        int waitMs = gpsEnabled
            ? Math.max(3_000, timeoutMs)
            : Math.min(8_000, Math.max(3_000, timeoutMs)); // GPS off: cell only after a short wait

        freshFixHandler.postDelayed(() -> {
            if (!done.compareAndSet(false, true)) return;
            stopFreshFixUpdates(manager);
            Location cell = liveCell.get();
            call.resolve(cell != null ? locationToJs(cell) : new JSObject());
        }, waitMs);
    }

    @ActivityCallback
    private void locationSettingsResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        ret.put("enabled", result.getResultCode() == Activity.RESULT_OK || isLocationEnabled());
        call.resolve(ret);
        emitLocationState();
    }

    private void openLocationSourceSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        startActivityForResult(call, intent, "locationSettingsResult");
    }

    private void resolveEnsureCall(boolean enabled) {
        if (pendingEnsureCall != null) {
            JSObject ret = new JSObject();
            ret.put("enabled", enabled);
            pendingEnsureCall.resolve(ret);
            pendingEnsureCall = null;
        }
        emitLocationState();
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject locationToJs(Location location) {
        JSObject ret = new JSObject();
        if (location == null) return ret;
        ret.put("latitude", location.getLatitude());
        ret.put("longitude", location.getLongitude());
        ret.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0d);
        ret.put("timestamp", location.getTime());
        if (location.getProvider() != null) {
            ret.put("provider", location.getProvider());
        }
        return ret;
    }

    private void stopFreshFixUpdates(LocationManager manager) {
        if (freshFixHandler != null) {
            freshFixHandler.removeCallbacksAndMessages(null);
        }
        for (LocationListener listener : freshFixListeners) {
            try {
                manager.removeUpdates(listener);
            } catch (Exception ignored) {
                // already removed
            }
        }
        freshFixListeners.clear();
    }

    private boolean isLocationEnabled() {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return manager.isLocationEnabled();
            }
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    private Location readBestLastKnown() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return null;
        Location best = null;
        for (String provider : manager.getAllProviders()) {
            try {
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate == null) continue;
                if (best == null || candidate.getTime() > best.getTime()) {
                    best = candidate;
                }
            } catch (SecurityException ignored) {
                // permission revoked mid-read
            }
        }
        return best;
    }

    private void registerProviderReceiver() {
        providerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                emitLocationState();
            }
        };
        IntentFilter filter = new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(providerReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(providerReceiver, filter);
        }
    }

    private void emitLocationState() {
        boolean enabled = isLocationEnabled();
        JSObject data = new JSObject();
        data.put("enabled", enabled);
        notifyListeners("locationStateChange", data);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String script = "window.dispatchEvent(new CustomEvent('eravat-location-state',{detail:{enabled:"
            + enabled + "}}));";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
    }
}
