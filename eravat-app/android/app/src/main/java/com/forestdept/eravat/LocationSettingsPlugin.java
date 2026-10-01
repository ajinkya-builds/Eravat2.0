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
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
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
    private FusedLocationProviderClient fusedClient;
    private LocationCallback fusedCallback;
    private PluginCall pendingFreshFixCall;
    private AtomicBoolean freshFixDone;
    /** Matches JS GPS_GOOD_ACCURACY_M. */
    private static final float GOOD_ACCURACY_M = 50f;
    /**
     * Matches JS INDOOR_USABLE_ACCURACY_M.
     * High-accuracy fused waits for a satellite lock by default, so a concrete room
     * never delivers a callback until the user reaches a door. Room-level Wi-Fi/network
     * fixes must be returned on their own.
     */
    private static final float INDOOR_USABLE_ACCURACY_M = 300f;
    private static final long INDOOR_REFINE_MS = 4000L;
    /** When set, only a strictly tighter fix may end the listen early. */
    private float freshFixImproveBelowM = Float.NaN;

    @Override
    public void load() {
        super.load();
        fusedClient = LocationServices.getFusedLocationProviderClient(getContext());
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
     * Continuous high-accuracy listen (GPS + fused). Network/cell is held and
     * only returned after the full GPS budget expires (or sooner if GPS is off).
     * Never returns getLastKnown. Do not call repeatedly in a short loop —
     * restarting clears GNSS lock progress.
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

        Integer timeout = call.getInt("timeoutMs", 90_000);
        int timeoutMs = timeout != null ? timeout : 90_000;
        Double improveBelow = call.getDouble("improveBelowM");
        freshFixImproveBelowM = improveBelow != null ? improveBelow.floatValue() : Float.NaN;
        call.setKeepAlive(true);
        // Cancel any prior listen so we never leave a hung PluginCall.
        resolvePendingFreshFixEmpty(manager);

        AtomicBoolean done = new AtomicBoolean(false);
        freshFixDone = done;
        pendingFreshFixCall = call;
        if (freshFixHandler == null) {
            freshFixHandler = new Handler(Looper.getMainLooper());
        }

        AtomicReference<Location> liveCell = new AtomicReference<>();
        AtomicReference<Location> liveIndoor = new AtomicReference<>();
        AtomicBoolean indoorArmed = new AtomicBoolean(false);

        final Runnable finishWithCell = () -> {
            if (!done.compareAndSet(false, true)) return;
            Location cell = liveCell.get();
            Location indoor = liveIndoor.get();
            PluginCall pending = pendingFreshFixCall;
            pendingFreshFixCall = null;
            stopFreshFixUpdates(manager);
            if (pending == null) return;
            if (!Float.isNaN(freshFixImproveBelowM)) {
                if (isImprovement(indoor)) {
                    pending.resolve(locationToJs(indoor));
                } else {
                    pending.resolve(new JSObject());
                }
                return;
            }
            Location chosen = indoor != null ? indoor : cell;
            pending.resolve(chosen != null ? locationToJs(chosen) : new JSObject());
        };

        final Runnable finishWithIndoor = () -> {
            if (!done.compareAndSet(false, true)) return;
            Location indoor = liveIndoor.get();
            PluginCall pending = pendingFreshFixCall;
            pendingFreshFixCall = null;
            stopFreshFixUpdates(manager);
            if (pending != null) {
                pending.resolve(indoor != null ? locationToJs(indoor) : new JSObject());
            }
        };

        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                handleFreshFixLocation(location, done, liveCell, liveIndoor, indoorArmed, finishWithIndoor, manager);
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
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
                registered = true;
            } catch (SecurityException ignored) {
                // permission revoked mid-request
            } catch (IllegalArgumentException ignored) {
                // provider missing on this device
            }
        }

        // Fused high-accuracy is typically much faster outdoors than raw GPS alone.
        if (fusedClient != null) {
            try {
                // waitForAccurateLocation defaults to true for high accuracy, so indoors the
                // callback never fires until a satellite lock — which is exactly "no GPS in
                // the room, instant at the door". Deliver the first Wi-Fi/network fix too.
                LocationRequest highAccuracy = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                    .setMinUpdateIntervalMillis(500L)
                    .setWaitForAccurateLocation(false)
                    .build();
                LocationRequest balanced = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 1000L)
                    .setMinUpdateIntervalMillis(500L)
                    .setWaitForAccurateLocation(false)
                    .build();
                fusedCallback = new LocationCallback() {
                    @Override
                    public void onLocationResult(LocationResult result) {
                        if (result == null) return;
                        Location best = result.getLastLocation();
                        if (best != null) {
                            handleFreshFixLocation(best, done, liveCell, liveIndoor, indoorArmed, finishWithIndoor, manager);
                        }
                    }
                };
                fusedClient.requestLocationUpdates(highAccuracy, fusedCallback, Looper.getMainLooper());
                fusedClient.requestLocationUpdates(balanced, fusedCallback, Looper.getMainLooper());
                registered = true;
            } catch (SecurityException ignored) {
                fusedCallback = null;
            } catch (Exception ignored) {
                fusedCallback = null;
            }
        }

        if (!registered) {
            done.set(true);
            pendingFreshFixCall = null;
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

        freshFixHandler.postDelayed(finishWithCell, waitMs);
    }

    @PluginMethod
    public void cancelFreshFix(PluginCall call) {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager != null) {
            resolvePendingFreshFixEmpty(manager);
        }
        call.resolve();
    }

    private void handleFreshFixLocation(
        Location location,
        AtomicBoolean done,
        AtomicReference<Location> liveCell,
        AtomicReference<Location> liveIndoor,
        AtomicBoolean indoorArmed,
        Runnable finishWithIndoor,
        LocationManager manager
    ) {
        if (location == null || done.get()) return;
        boolean improving = !Float.isNaN(freshFixImproveBelowM);
        if (improving && !isImprovement(location)) {
            return;
        }
        if (isGoodAccuracy(location)) {
            if (!done.compareAndSet(false, true)) return;
            if (freshFixHandler != null) freshFixHandler.removeCallbacksAndMessages(null);
            PluginCall pending = pendingFreshFixCall;
            pendingFreshFixCall = null;
            stopFreshFixUpdates(manager);
            if (pending != null) {
                pending.resolve(locationToJs(location));
            }
            return;
        }
        if (isIndoorUsable(location)) {
            if (isBetterFix(location, liveIndoor.get())) {
                liveIndoor.set(location);
            }
            if (indoorArmed.compareAndSet(false, true) && freshFixHandler != null) {
                freshFixHandler.postDelayed(finishWithIndoor, INDOOR_REFINE_MS);
            }
            return;
        }
        if (improving) return;
        if (isBetterFix(location, liveCell.get())) {
            liveCell.set(location);
        }
    }

    private boolean isGoodAccuracy(Location location) {
        return location.hasAccuracy()
            && location.getAccuracy() > 0f
            && location.getAccuracy() <= GOOD_ACCURACY_M;
    }

    /** Real GNSS, or a room-level Wi-Fi/fused fix. Coarse cell towers are excluded. */
    private boolean isIndoorUsable(Location location) {
        String provider = location.getProvider() != null ? location.getProvider() : "";
        if (LocationManager.GPS_PROVIDER.equals(provider)) return true;
        return location.hasAccuracy()
            && location.getAccuracy() > 0f
            && location.getAccuracy() <= INDOOR_USABLE_ACCURACY_M;
    }

    private boolean isImprovement(Location location) {
        if (Float.isNaN(freshFixImproveBelowM)) return true;
        return location != null
            && location.hasAccuracy()
            && location.getAccuracy() > 0f
            && location.getAccuracy() < freshFixImproveBelowM;
    }

    private boolean isBetterFix(Location next, Location previous) {
        if (next == null) return false;
        if (previous == null) return true;
        if (next.hasAccuracy() && previous.hasAccuracy()) {
            return next.getAccuracy() < previous.getAccuracy();
        }
        if (next.hasAccuracy() && !previous.hasAccuracy()) return true;
        return next.getTime() >= previous.getTime();
    }

    private void resolvePendingFreshFixEmpty(LocationManager manager) {
        AtomicBoolean done = freshFixDone;
        if (done != null && !done.compareAndSet(false, true)) {
            stopFreshFixUpdates(manager);
            return;
        }
        if (done == null && pendingFreshFixCall == null) {
            stopFreshFixUpdates(manager);
            return;
        }
        PluginCall pending = pendingFreshFixCall;
        pendingFreshFixCall = null;
        stopFreshFixUpdates(manager);
        if (pending != null) {
            pending.resolve(new JSObject());
        }
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
        if (fusedClient != null && fusedCallback != null) {
            try {
                fusedClient.removeLocationUpdates(fusedCallback);
            } catch (Exception ignored) {
                // already removed
            }
            fusedCallback = null;
        }
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
