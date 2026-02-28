import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Smartphone, Bell, Database, Radio, X, ShieldCheck, ShieldOff, Copy, Check } from 'lucide-react';
import { supabase } from '../../supabase';
import {
    RadiusSlider, RadiusPreview, SaveIndicator,
    clamp, MAX_KM, MIN_KM, type SaveState,
} from '../../components/shared/RadiusSlider';
import { useLanguage } from '../../contexts/LanguageContext';

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onToggle}
            type="button"
            disabled={disabled}
            className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-muted border border-border'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <motion.div
                animate={{ x: enabled ? 20 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`absolute top-[3px] w-5 h-5 rounded-full shadow ${enabled ? 'bg-white' : 'bg-muted-foreground/60'}`}
            />
        </button>
    );
}

const DEBOUNCE_MS = 800;

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const { t } = useLanguage();

    // ── Proximity state ──────────────────────────────────────────────────────
    const [globalRadius, setGlobalRadius] = useState(10);
    const [proximityEnabled, setProximityEnabled] = useState(true);
    const [radiusSaveState, setRadiusSaveState] = useState<SaveState>('idle');

    // ── MFA state ────────────────────────────────────────────────────────────
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [mfaLoading, setMfaLoading] = useState(true);
    const [mfaEnrolling, setMfaEnrolling] = useState(false);
    const [mfaQr, setMfaQr] = useState<string | null>(null);
    const [mfaSecret, setMfaSecret] = useState<string | null>(null);
    const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [mfaVerifying, setMfaVerifying] = useState(false);
    const [confirmDisable2FA, setConfirmDisable2FA] = useState(false);
    const [mfaToast, setMfaToast] = useState<string | null>(null);
    const [secretCopied, setSecretCopied] = useState(false);

    // Load MFA status on mount
    useEffect(() => {
        (async () => {
            try {
                const { data } = await supabase.auth.mfa.listFactors();
                if (data) {
                    const verifiedFactor = data.totp.find(f => f.status === 'verified');
                    if (verifiedFactor) {
                        setMfaEnabled(true);
                        setMfaFactorId(verifiedFactor.id);
                    }
                }
            } catch {
                // MFA check failed silently
            } finally {
                setMfaLoading(false);
            }
        })();
    }, []);

    // Load current default from any profile (system-wide, we treat the most common value as the default)
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('profiles')
                .select('notification_radius_km')
                .limit(1)
                .single();
            if (data?.notification_radius_km) setGlobalRadius(data.notification_radius_km);
        })();
    }, []);

    const persistRadius = useCallback(async (newRadius: number) => {
        setRadiusSaveState('saving');
        // Update ALL profiles to the new system-wide default
        const { error } = await supabase
            .from('profiles')
            .update({ notification_radius_km: newRadius })
            .gte('id', '00000000-0000-0000-0000-000000000000'); // match all rows

        setRadiusSaveState(error ? 'error' : 'saved');
        setTimeout(() => setRadiusSaveState('idle'), 2500);
    }, []);

    // Debounced save
    useEffect(() => {
        const timer = setTimeout(() => persistRadius(globalRadius), DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalRadius]);

    const handleRadiusChange = (v: number) => {
        setGlobalRadius(clamp(v));
        setRadiusSaveState('idle');
    };

    const handleRadiusInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) handleRadiusChange(parsed);
    };

    // ── MFA Handlers ─────────────────────────────────────────────────────────

    const handleMfaToggle = async () => {
        if (mfaLoading) return;
        if (mfaEnabled) {
            // Show confirmation dialog before disabling
            setConfirmDisable2FA(true);
        } else {
            // Start enrollment
            await startEnrollment();
        }
    };

    const startEnrollment = async () => {
        setMfaError(null);
        setMfaCode('');
        setMfaEnrolling(true);
        setSecretCopied(false);

        try {
            // Clean up any unverified factors first
            const { data: existingFactors } = await supabase.auth.mfa.listFactors();
            if (existingFactors) {
                for (const factor of existingFactors.totp) {
                    if (factor.status === 'unverified') {
                        await supabase.auth.mfa.unenroll({ factorId: factor.id });
                    }
                }
            }

            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
            if (error) throw error;

            setMfaQr(data.totp.qr_code);
            setMfaSecret(data.totp.secret);
            setMfaFactorId(data.id);
        } catch (err: any) {
            setMfaError(err.message || 'Failed to start 2FA enrollment');
            // Keep mfaEnrolling true so the error card stays visible
        }
    };

    const handleVerifyAndEnable = async () => {
        if (!mfaFactorId || mfaCode.length !== 6) return;
        setMfaVerifying(true);
        setMfaError(null);

        try {
            const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
            if (challengeErr) throw challengeErr;

            const { error: verifyErr } = await supabase.auth.mfa.verify({
                factorId: mfaFactorId,
                challengeId: challengeData.id,
                code: mfaCode,
            });
            if (verifyErr) throw verifyErr;

            setMfaEnabled(true);
            setMfaEnrolling(false);
            setMfaQr(null);
            setMfaSecret(null);
            setMfaCode('');
            setMfaToast(t('mfa.success'));
            setTimeout(() => setMfaToast(null), 3000);
        } catch (err: any) {
            setMfaError(err.message?.includes('Invalid') ? t('mfa.invalidCode') : (err.message || t('mfa.invalidCode')));
        } finally {
            setMfaVerifying(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!mfaFactorId) return;
        setMfaVerifying(true);
        setMfaError(null);

        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
            if (error) throw error;

            setMfaEnabled(false);
            setMfaFactorId(null);
            setConfirmDisable2FA(false);
            setMfaToast(t('mfa.disabled'));
            setTimeout(() => setMfaToast(null), 3000);
        } catch (err: any) {
            setMfaError(err.message || 'Failed to disable 2FA');
        } finally {
            setMfaVerifying(false);
        }
    };

    const handleCopySecret = () => {
        if (mfaSecret) {
            navigator.clipboard.writeText(mfaSecret);
            setSecretCopied(true);
            setTimeout(() => setSecretCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">

            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin.settings.title')}</h1>
                <p className="text-muted-foreground mt-1 text-sm">{t('admin.settings.subtitle')}</p>
            </div>

            {/* MFA Toast */}
            <AnimatePresence>
                {mfaToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
                    >
                        <ShieldCheck size={16} /> {mfaToast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Security ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-6"
            >
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                        <Shield size={18} className="text-primary" />
                        {t('admin.settings.sessionSecurity')}
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-sm">{t('admin.settings.forceReauth')}</p>
                                <p className="text-xs text-muted-foreground">{t('admin.settings.forceReauthDesc')}</p>
                            </div>
                            <Toggle enabled={true} onToggle={() => {}} />
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                            <div>
                                <p className="font-medium text-sm">{t('admin.settings.twoFactor')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {mfaEnabled ? t('mfa.enabled') : t('admin.settings.twoFactorDesc')}
                                </p>
                            </div>
                            <Toggle enabled={mfaEnabled} onToggle={handleMfaToggle} disabled={mfaLoading} />
                        </div>
                    </div>
                </div>

                {/* ── MFA Enrollment Card ── */}
                <AnimatePresence>
                    {mfaEnrolling && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="glass-card rounded-2xl p-6 border-2 border-primary/30">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <ShieldCheck size={20} className="text-primary" />
                                        {t('mfa.enrollTitle')}
                                    </h3>
                                    <button
                                        onClick={() => {
                                            setMfaEnrolling(false);
                                            setMfaQr(null);
                                            setMfaSecret(null);
                                            setMfaCode('');
                                            setMfaError(null);
                                            if (mfaFactorId) {
                                                supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
                                                setMfaFactorId(null);
                                            }
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                    >
                                        <X size={18} className="text-muted-foreground" />
                                    </button>
                                </div>

                                {mfaError && !mfaQr && (
                                    <div className="text-center py-6 space-y-3">
                                        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                            {mfaError}
                                        </div>
                                        <button
                                            onClick={startEnrollment}
                                            className="text-sm text-primary font-medium hover:underline"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                )}

                                {!mfaQr && !mfaError && (
                                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                                        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        <p className="text-sm text-muted-foreground">Generating QR code...</p>
                                    </div>
                                )}

                                {mfaQr && (
                                    <>
                                        <p className="text-sm text-muted-foreground mb-4">{t('mfa.enrollDesc')}</p>
                                        <div className="flex justify-center mb-4">
                                            <div className="bg-white p-4 rounded-xl shadow-sm">
                                                <img src={mfaQr} alt="TOTP QR Code" className="w-48 h-48" />
                                            </div>
                                        </div>

                                        {mfaSecret && (
                                            <div className="mb-4">
                                                <p className="text-xs text-muted-foreground mb-1">{t('mfa.manualEntry')}</p>
                                                <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border/50">
                                                    <code className="text-xs font-mono text-foreground flex-1 break-all select-all">{mfaSecret}</code>
                                                    <button
                                                        onClick={handleCopySecret}
                                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
                                                        title="Copy"
                                                    >
                                                        {secretCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-muted-foreground" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={6}
                                                placeholder={t('mfa.enterCode')}
                                                value={mfaCode}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                    setMfaCode(val);
                                                    setMfaError(null);
                                                }}
                                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                                autoFocus
                                            />

                                            {mfaError && (
                                                <p className="text-sm text-destructive text-center">{mfaError}</p>
                                            )}

                                            <button
                                                onClick={handleVerifyAndEnable}
                                                disabled={mfaCode.length !== 6 || mfaVerifying}
                                                className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3 px-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                                            >
                                                {mfaVerifying ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <ShieldCheck size={16} />
                                                        {t('mfa.verify')}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Disable 2FA Confirmation Modal ── */}
                <AnimatePresence>
                    {confirmDisable2FA && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                            onClick={() => setConfirmDisable2FA(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                className="glass-card rounded-2xl p-6 max-w-sm w-full shadow-xl"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-xl bg-destructive/10">
                                        <ShieldOff size={20} className="text-destructive" />
                                    </div>
                                    <h3 className="text-lg font-bold">{t('mfa.disable')}</h3>
                                </div>
                                <p className="text-sm text-foreground mb-2">{t('mfa.disableConfirm')}</p>
                                <p className="text-xs text-muted-foreground mb-6">{t('mfa.disableDesc')}</p>

                                {mfaError && (
                                    <p className="text-sm text-destructive mb-4">{mfaError}</p>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setConfirmDisable2FA(false); setMfaError(null); }}
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                                    >
                                        {t('mfa.cancel')}
                                    </button>
                                    <button
                                        onClick={handleDisable2FA}
                                        disabled={mfaVerifying}
                                        className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {mfaVerifying ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            t('mfa.confirm')
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── Data Sync ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-2xl p-6"
            >
                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                    <Database size={18} className="text-primary" />
                    {t('admin.settings.dataSync')}
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm">{t('as_media_quality')}</p>
                            <p className="text-xs text-muted-foreground">{t('as_media_quality_desc')}</p>
                        </div>
                        <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-lg">High</span>
                    </div>
                </div>
            </motion.div>

            {/* ── Notifications ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-6"
            >
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                        <Bell size={18} className="text-primary" />
                        {t('admin.settings.notifications')}
                    </h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm">{t('as_enable_proximity')}</p>
                            <p className="text-xs text-muted-foreground">
                                {t('as_proximity_desc')}
                            </p>
                        </div>
                        <Toggle enabled={proximityEnabled} onToggle={() => setProximityEnabled(!proximityEnabled)} />
                    </div>
                </div>

                <div className={`glass-card rounded-2xl p-6 space-y-6 transition-opacity ${proximityEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <Radio size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-foreground">{t('as_default_radius')}</h3>
                            <p className="text-xs text-muted-foreground">{t('as_radius_system_wide')}</p>
                        </div>
                    </div>

                    <RadiusPreview km={globalRadius} max={MAX_KM} />

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label htmlFor="radius-slider" className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Radio size={15} className="text-primary" />
                                {t('as_alert_radius')}
                            </label>
                            <div className="flex items-center gap-2">
                                <SaveIndicator state={radiusSaveState} />
                                <div className="flex items-center gap-1 bg-primary/10 rounded-xl px-3 py-1">
                                    <input
                                        type="number"
                                        id="radius-input"
                                        min={MIN_KM}
                                        max={MAX_KM}
                                        value={globalRadius}
                                        onChange={handleRadiusInput}
                                        className="w-12 bg-transparent text-center text-sm font-bold text-primary focus:outline-none"
                                        aria-label="Alert radius value"
                                    />
                                    <span className="text-xs font-semibold text-primary/70">km</span>
                                </div>
                            </div>
                        </div>

                        <RadiusSlider value={globalRadius} onChange={handleRadiusChange} min={MIN_KM} max={MAX_KM} />
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                        All personnel will receive notifications when a report is filed within{' '}
                        <span className="font-semibold text-foreground">{globalRadius} km</span> of their
                        assigned region centroid. Range: {MIN_KM}–{MAX_KM} km.
                    </p>
                </div>
            </motion.div>

            {/* ── App Versions ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card rounded-2xl p-6"
            >
                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                    <Smartphone size={18} className="text-primary" />
                    {t('admin.settings.appVersions')}
                </h3>
                <div className="space-y-4">
                    {[
                        { label: 'Web App', version: '2.0.0', status: 'Current' },
                        { label: 'Android APK', version: '2.0.0', status: 'Current' },
                        { label: 'Supabase Backend', version: 'v2 (hosted)', status: 'Online' },
                        { label: 'PostGIS Extension', version: '3.4', status: 'Active' },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                            <div>
                                <p className="font-medium text-sm">{item.label}</p>
                                <p className="text-xs text-muted-foreground">Version {item.version}</p>
                            </div>
                            <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                                {item.status}
                            </span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
