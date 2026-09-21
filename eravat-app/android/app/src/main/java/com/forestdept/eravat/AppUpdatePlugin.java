package com.forestdept.eravat;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
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
import java.io.OutputStream;
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

        File file = resolveApkFile(path);
        if (file == null) {
            call.reject("APK file not found: " + path);
            return;
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

    /**
     * Copy an APK into the public Downloads folder so it survives app uninstall
     * (needed for one-time signing-reset migrations).
     */
    @PluginMethod
    public void saveApkToDownloads(PluginCall call) {
        String path = call.getString("path");
        String fileName = call.getString("fileName", "Eravat-update.apk");
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }
        if (fileName == null || fileName.isEmpty()) {
            fileName = "Eravat-update.apk";
        }
        if (!fileName.toLowerCase().endsWith(".apk")) {
            fileName = fileName + ".apk";
        }

        File file = resolveApkFile(path);
        if (file == null) {
            call.reject("APK file not found: " + path);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri item = getContext().getContentResolver().insert(collection, values);
                if (item == null) {
                    call.reject("Could not create Downloads entry");
                    return;
                }
                try (FileInputStream in = new FileInputStream(file);
                        OutputStream out = getContext().getContentResolver().openOutputStream(item)) {
                    if (out == null) {
                        call.reject("Could not write to Downloads");
                        return;
                    }
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        out.write(buf, 0, n);
                    }
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(item, values, null, null);

                JSObject ret = new JSObject();
                ret.put("fileName", fileName);
                ret.put("uri", item.toString());
                ret.put("folder", "Downloads");
                call.resolve(ret);
            } else {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.exists() && !downloads.mkdirs()) {
                    call.reject("Downloads folder unavailable");
                    return;
                }
                File dest = new File(downloads, fileName);
                try (FileChannel in = new FileInputStream(file).getChannel();
                        FileChannel out = new FileOutputStream(dest).getChannel()) {
                    out.transferFrom(in, 0, in.size());
                }
                Intent scan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
                scan.setData(Uri.fromFile(dest));
                getContext().sendBroadcast(scan);

                JSObject ret = new JSObject();
                ret.put("fileName", fileName);
                ret.put("uri", Uri.fromFile(dest).toString());
                ret.put("folder", "Downloads");
                ret.put("path", dest.getAbsolutePath());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to save APK to Downloads: " + e.getMessage(), e);
        }
    }

    /** Opens the system uninstall screen for this app (user must confirm). */
    @PluginMethod
    public void openUninstall(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_DELETE);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open uninstall: " + e.getMessage(), e);
        }
    }

    /** Opens the system Files/Downloads UI so the user can tap the saved APK. */
    @PluginMethod
    public void openDownloads(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    "resource/folder"
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    activity.startActivity(intent);
                    call.resolve();
                    return;
                } catch (Exception ignored) {
                    // fall through
                }
            }
            Intent fallback = new Intent(Intent.ACTION_VIEW);
            fallback.setType("*/*");
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(Intent.createChooser(fallback, "Open Downloads"));
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open Downloads: " + e.getMessage(), e);
        }
    }

    private File resolveApkFile(String path) {
        File file = new File(path);
        if (file.exists()) {
            return file;
        }
        File alt = new File(getContext().getCacheDir(), path);
        if (alt.exists()) {
            return alt;
        }
        // Capacitor may return file:// URIs
        if (path.startsWith("file:")) {
            File fromUri = new File(Uri.parse(path).getPath());
            if (fromUri.exists()) {
                return fromUri;
            }
        }
        return null;
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
