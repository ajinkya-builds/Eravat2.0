package com.forestdept.eravat;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String packageName = getContext().getPackageName();
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0));
            } else {
                info = pm.getPackageInfo(packageName, 0);
            }
            JSObject ret = new JSObject();
            ret.put("versionName", info.versionName != null ? info.versionName : "");
            long versionCode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                versionCode = info.getLongVersionCode();
            } else {
                versionCode = info.versionCode;
            }
            ret.put("versionCode", versionCode);
            ret.put("packageName", packageName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read app version: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }

        File file = new File(path);
        if (!file.exists()) {
            // Capacitor Filesystem may pass a path without the absolute cache root.
            File alt = new File(getContext().getCacheDir(), path);
            if (alt.exists()) {
                file = alt;
            } else {
                call.reject("APK file not found: " + path);
                return;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("install_permission_required");
            return;
        }

        try {
            File installFile = copyToInstallDir(file);
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                installFile
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            grantInstallerUriPermission(uri);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start APK install: " + e.getMessage(), e);
        }
    }

    private File copyToInstallDir(File source) throws IOException {
        File dir = new File(getContext().getFilesDir(), "apk-updates");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Could not create APK install directory");
        }
        File dest = new File(dir, "eravat-update.apk");
        try (FileChannel in = new FileInputStream(source).getChannel();
                FileChannel out = new FileOutputStream(dest).getChannel()) {
            out.transferFrom(in, 0, in.size());
        }
        return dest;
    }

    private void grantInstallerUriPermission(Uri uri) {
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
        String[] packages = new String[] {
            "com.google.android.packageinstaller",
            "com.android.packageinstaller",
            "com.google.android.apps.nbu.files",
            "com.android.documentsui"
        };
        for (String pkg : packages) {
            try {
                getContext().grantUriPermission(pkg, uri, flags);
            } catch (Exception ignored) {
                // Package may not exist on this device.
            }
        }
    }
}
