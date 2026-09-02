import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Smartphone, Map, Languages, Download, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { PAGE_STICKY_HEADER } from '../../lib/layout';
import { AppUpdate } from '../../plugins/AppUpdate';
import {
    checkForAppUpdate,
    downloadAndInstallUpdate,
    type UpdateManifest,
} from '../../services/appUpdateService';
import { APP_VERSION, formatAppVersionLabel } from '../../lib/appVersion';

export default function AppSettings() {
    const { t, language: globalLanguage, setLanguage: setGlobalLanguage } = useLanguage();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    // Load from local storage synchronously
    const getInitialState = () => {
        try {
            const saved = localStorage.getItem('eravat_app_settings');
            if (saved) return JSON.parse(saved);
        } catch { /* ignore malformed settings */ }
        return {};
    };

    const initial = getInitialState();

    const [mapStyle, setMapStyle] = useState<'terrain' | 'satellite'>(initial.mapStyle || 'terrain');
    const [installedLabel, setInstalledLabel] = useState(formatAppVersionLabel(APP_VERSION));
    const [updateBusy, setUpdateBusy] = useState(false);
    const [updatePhase, setUpdatePhase] = useState<string | null>(null);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [pendingManifest, setPendingManifest] = useState<UpdateManifest | null>(null);
    const [whatsNew, setWhatsNew] = useState<string[]>(() => [...APP_VERSION.changes]);

    useEffect(() => {
        if (!isAndroid) return;
        void AppUpdate.getAppInfo()
            .then((info) => setInstalledLabel(formatAppVersionLabel(info)))
            .catch(() => setInstalledLabel(formatAppVersionLabel(APP_VERSION)));
    }, [isAndroid]);

    // Persist map prefs (theme via ThemeContext; language via LanguageContext).
    useEffect(() => {
        const settings = { ...initial, mapStyle };
        delete settings.autoSync;
        delete settings.wifiOnly;
        localStorage.setItem('eravat_app_settings', JSON.stringify(settings));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapStyle]);

    const handleCheckUpdate = async () => {
        setUpdateBusy(true);
        setUpdateError(null);
        setUpdateMessage(null);
        setPendingManifest(null);
        setUpdatePhase(t('settings.updateChecking'));
        try {
            const result = await checkForAppUpdate();
            if (result.status === 'unsupported') {
                setUpdateMessage(t('settings.updateAndroidOnly'));
            } else if (result.status === 'up_to_date') {
                setUpdateMessage(t('settings.updateUpToDate'));
                setInstalledLabel(formatAppVersionLabel({ versionName: result.versionName, versionCode: result.current }));
                setWhatsNew([...APP_VERSION.changes]);
            } else if (result.status === 'available') {
                setPendingManifest(result.manifest);
                const nextChanges = result.manifest.changes?.length
                    ? [...result.manifest.changes]
                    : [...APP_VERSION.changes];
                setWhatsNew(nextChanges);
                setUpdateMessage(
                    t('settings.updateAvailable')
                        .replace('{version}', result.versionName)
                        .replace('{code}', String(result.latest)),
                );
            } else {
                setUpdateError(result.message || t('settings.updateCheckFailed'));
            }
        } catch (err) {
            setUpdateError(err instanceof Error ? err.message : t('settings.updateCheckFailed'));
        } finally {
            setUpdateBusy(false);
            setUpdatePhase(null);
        }
    };

    const handleInstallUpdate = async () => {
        if (!pendingManifest) return;
        setUpdateBusy(true);
        setUpdateError(null);
        setUpdateMessage(null);
        try {
            await downloadAndInstallUpdate(pendingManifest, (p) => {
                if (p.phase === 'permission') setUpdatePhase(t('settings.updatePermission'));
                else if (p.phase === 'download') setUpdatePhase(t('settings.updateDownloading'));
                else if (p.phase === 'cleanup') setUpdatePhase(t('settings.updateCleaning'));
                else if (p.phase === 'install') setUpdatePhase(t('settings.updateInstalling'));
            });
            setUpdateMessage(t('settings.updateInstallPrompted'));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === 'install_permission_required') {
                setUpdateError(t('settings.updateAllowInstalls'));
            } else {
                setUpdateError(msg || t('settings.updateInstallFailed'));
            }
        } finally {
            setUpdateBusy(false);
            setUpdatePhase(null);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            {/* Header */}
            <div className={PAGE_STICKY_HEADER}>
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('app_settings')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Theme & Appearance */}
                <div className="space-y-3 animate-fade-in">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('appearance')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    {theme === 'system' ? <Smartphone size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                </div>
                                <span className="font-medium">{t('choose_theme')}</span>
                            </div>
                            <div className="flex bg-muted/50 p-1 rounded-xl">
                                <button
                                    type="button"
                                    data-testid="theme-light"
                                    data-ph-action="settings.theme.light"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('light')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'light' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('light')}
                                </button>
                                <button
                                    type="button"
                                    data-testid="theme-dark"
                                    data-ph-action="settings.theme.dark"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('dark')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'dark' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('dark')}
                                </button>
                                <button
                                    type="button"
                                    data-testid="theme-system"
                                    data-ph-action="settings.theme.system"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('system')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'system' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('system')}
                                </button>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Languages size={18} />
                                </div>
                                <span className="font-medium">{t('language')}</span>
                            </div>
                            <select
                                data-testid="language-select"
                                data-ph-filter="settings.language"
                                data-ph-screen="settings"
                                value={globalLanguage}
                                onChange={(e) => setGlobalLanguage(e.target.value as 'en' | 'hi' | 'mr')}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="en">{t('english')}</option>
                                <option value="hi">{t('hindi')}</option>
                                <option value="mr">{t('marathi')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Map Settings */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('map_options')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                    <Map size={18} />
                                </div>
                                <span className="font-medium">{t('map_style')}</span>
                            </div>
                            <select
                                data-ph-filter="settings.map_style"
                                data-ph-screen="settings"
                                value={mapStyle}
                                onChange={(e) => setMapStyle(e.target.value as 'terrain' | 'satellite')}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="terrain">{t('terrain')}</option>
                                <option value="satellite">{t('satellite')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* App update */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                        {t('settings.updateSection')}
                    </h2>
                    <div className="glass-card rounded-2xl overflow-hidden">
                        <div className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                                    <Download size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium">{t('settings.updateTitle')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {t('settings.updateDesc')}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('settings.installedVersion')}: <span className="font-mono text-foreground">{installedLabel}</span>
                                    </p>
                                    {whatsNew.length > 0 && (
                                        <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2">
                                            <p className="text-xs font-semibold text-foreground mb-1">
                                                {pendingManifest ? t('settings.updateWhatsNew') : t('settings.thisVersionChanges')}
                                            </p>
                                            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                                {whatsNew.slice(0, 8).map((line) => (
                                                    <li key={line}>{line}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {updatePhase && (
                                <p className="text-xs text-primary flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    {updatePhase}
                                </p>
                            )}
                            {updateMessage && (
                                <p className="text-xs text-emerald-700 flex items-start gap-2">
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                                    <span>{updateMessage}</span>
                                </p>
                            )}
                            {updateError && (
                                <p className="text-xs text-destructive">{updateError}</p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    data-testid="check-app-update"
                                    data-ph-action="settings.update.check"
                                    data-ph-screen="settings"
                                    disabled={updateBusy || !isAndroid}
                                    onClick={() => void handleCheckUpdate()}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground text-sm font-semibold disabled:opacity-50"
                                >
                                    {updateBusy && !pendingManifest ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={16} />
                                    )}
                                    {t('settings.checkUpdate')}
                                </button>
                                <button
                                    type="button"
                                    data-testid="install-app-update"
                                    data-ph-action="settings.update.install"
                                    data-ph-screen="settings"
                                    disabled={updateBusy || !pendingManifest}
                                    onClick={() => void handleInstallUpdate()}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                                >
                                    {updateBusy && pendingManifest ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Download size={16} />
                                    )}
                                    {t('settings.installUpdate')}
                                </button>
                            </div>

                            {!isAndroid && (
                                <p className="text-xs text-muted-foreground">{t('settings.updateAndroidOnly')}</p>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
