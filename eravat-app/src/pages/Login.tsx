import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, ArrowRight, AlertCircle, Timer, ShieldCheck, ArrowLeft, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabase';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;
const OTP_RESEND_COOLDOWN_SEC = 60;

type LoginMode = 'password' | 'otp';
type OTPStep = 'phone_entry' | 'otp_verification';

export default function Login() {
    const navigate = useNavigate();
    const { signInWithPhone, signInWithPhoneOTP, verifyOTP, resendOTP, signOut } = useAuth();
    const { t } = useLanguage();

    // ── Login Mode State ──────────────────────────────────────────────────────
    const [loginMode, setLoginMode] = useState<LoginMode>('password');

    // ── Password Login State ──────────────────────────────────────────────────
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [lockUntil, setLockUntil] = useState<number | null>(null);
    const [countdown, setCountdown] = useState(0);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── OTP Login State ───────────────────────────────────────────────────────
    const [otpStep, setOtpStep] = useState<OTPStep>('phone_entry');
    const [otpPhone, setOtpPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState<string | null>(null);
    const [otpResendCountdown, setOtpResendCountdown] = useState(0);
    const otpResendRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── MFA State (shared between both modes) ─────────────────────────────────
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [mfaVerifying, setMfaVerifying] = useState(false);

    // ── Rate Limit Countdown Timer ────────────────────────────────────────────
    useEffect(() => {
        if (!lockUntil) return;
        const tick = () => {
            const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setLockUntil(null);
                setCountdown(0);
                setAttempts(0);
                setError(null);
                if (countdownRef.current) clearInterval(countdownRef.current);
            } else {
                setCountdown(remaining);
            }
        };
        tick();
        countdownRef.current = setInterval(tick, 1000);
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [lockUntil]);

    // ── OTP Resend Countdown Timer ────────────────────────────────────────────
    useEffect(() => {
        if (otpResendCountdown <= 0) {
            if (otpResendRef.current) clearInterval(otpResendRef.current);
            return;
        }
        otpResendRef.current = setInterval(() => {
            setOtpResendCountdown(prev => {
                if (prev <= 1) {
                    if (otpResendRef.current) clearInterval(otpResendRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (otpResendRef.current) clearInterval(otpResendRef.current); };
    }, [otpResendCountdown]);

    const isLocked = lockUntil !== null && Date.now() < lockUntil;

    // ══════════════════════════════════════════════════════════════════════════
    // PASSWORD LOGIN HANDLERS
    // ══════════════════════════════════════════════════════════════════════════

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLocked) return;

        // Client-side validation
        if (!phone.trim()) {
            setError('Phone number is required');
            return;
        }

        if (!password) {
            setError('Password is required');
            return;
        }

        if (phone.trim().length < 10) {
            setError('Please enter a valid phone number');
            return;
        }

        setIsLoading(true);
        setError(null);

        const { error, mfaRequired: needsMfa } = await signInWithPhone(phone.trim(), password);

        if (error) {
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            if (newAttempts >= MAX_ATTEMPTS) {
                setLockUntil(Date.now() + LOCK_DURATION_MS);
                setError(`Too many failed attempts. Please wait ${LOCK_DURATION_MS / 1000} seconds before trying again.`);
            } else {
                setError('Invalid credentials. Please try again.');
            }
            setIsLoading(false);
        } else if (needsMfa) {
            // Password verified, but MFA is required — show TOTP challenge
            setMfaRequired(true);
            setIsLoading(false);
        } else {
            // Reset rate-limit state on success
            setAttempts(0);
            setLockUntil(null);
            navigate('/');
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // OTP LOGIN HANDLERS
    // ══════════════════════════════════════════════════════════════════════════

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!otpPhone.trim()) {
            setOtpError(t('otp.invalidPhone'));
            return;
        }

        if (otpPhone.trim().length < 10) {
            setOtpError(t('otp.invalidPhone'));
            return;
        }

        setOtpLoading(true);
        setOtpError(null);

        const { error, message } = await signInWithPhoneOTP(otpPhone.trim());

        if (error) {
            if (message === 'rate_limit') {
                setOtpError(t('otp.tooManyRequests'));
            } else {
                setOtpError(error.message);
            }
            setOtpLoading(false);
        } else {
            // OTP sent successfully
            setOtpStep('otp_verification');
            setOtpResendCountdown(OTP_RESEND_COOLDOWN_SEC);
            setOtpLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();

        if (otpCode.length !== 6) {
            setOtpError(t('otp.invalidCode'));
            return;
        }

        setOtpLoading(true);
        setOtpError(null);

        const { error, mfaRequired: needsMfa } = await verifyOTP(otpPhone.trim(), otpCode);

        if (error) {
            setOtpError(error.message);
            setOtpLoading(false);
        } else if (needsMfa) {
            // OTP verified, but MFA is required
            setMfaRequired(true);
            setOtpLoading(false);
        } else {
            // Success - navigate to home
            navigate('/');
        }
    };

    const handleResendOTP = async () => {
        if (otpResendCountdown > 0) return;

        setOtpLoading(true);
        setOtpError(null);

        const { error } = await resendOTP(otpPhone.trim());

        if (error) {
            setOtpError(error.message);
            setOtpLoading(false);
        } else {
            setOtpResendCountdown(OTP_RESEND_COOLDOWN_SEC);
            setOtpLoading(false);
        }
    };

    const handleOtpBack = () => {
        setOtpStep('phone_entry');
        setOtpCode('');
        setOtpError(null);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // MFA HANDLERS (shared)
    // ══════════════════════════════════════════════════════════════════════════

    const handleMfaVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mfaCode.length !== 6) return;
        setMfaVerifying(true);
        setMfaError(null);

        try {
            const { data: factorsData } = await supabase.auth.mfa.listFactors();
            const totpFactor = factorsData?.totp?.find(f => f.status === 'verified');

            if (!totpFactor) {
                setMfaError(t('mfa.invalidCode'));
                setMfaVerifying(false);
                return;
            }

            const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
                factorId: totpFactor.id,
            });
            if (challengeErr) throw challengeErr;

            const { error: verifyErr } = await supabase.auth.mfa.verify({
                factorId: totpFactor.id,
                challengeId: challengeData.id,
                code: mfaCode,
            });
            if (verifyErr) throw verifyErr;

            // MFA verified — navigate to home
            setAttempts(0);
            setLockUntil(null);
            navigate('/');
        } catch {
            setMfaError(t('mfa.invalidCode'));
        } finally {
            setMfaVerifying(false);
        }
    };

    const handleMfaBack = async () => {
        // Sign out the partial AAL1 session and go back to login form
        await signOut();
        setMfaRequired(false);
        setMfaCode('');
        setMfaError(null);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // MODE SWITCHING
    // ══════════════════════════════════════════════════════════════════════════

    const switchToPassword = () => {
        setLoginMode('password');
        setOtpError(null);
        setOtpStep('phone_entry');
        setOtpCode('');
        setOtpPhone('');
    };

    const switchToOTP = () => {
        setLoginMode('otp');
        setError(null);
        setPassword('');
    };

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-15%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/20 blur-[120px] mix-blend-multiply" />
            <div className="absolute bottom-[-10%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-500/15 blur-[120px] mix-blend-multiply" />
            <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[80px]" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md p-8"
            >
                <div className="glass-card rounded-[2rem] p-10 premium-shadow">
                    <AnimatePresence mode="wait">
                        {mfaRequired ? (
                            /* ══════════════════════════════════════════════════════ */
                            /* MFA CHALLENGE FORM                                      */
                            /* ══════════════════════════════════════════════════════ */
                            <motion.div
                                key="mfa"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                {/* Compact app branding */}
                                <div className="flex items-center justify-center gap-2 mb-6">
                                    <div className="w-8 h-8 relative flex items-center justify-center overflow-visible">
                                        <img src="/elephant-logo.png" alt="App Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain" />
                                    </div>
                                    <span className="text-sm font-semibold text-muted-foreground">{t('wild_elephant_monitoring')}</span>
                                </div>

                                {/* MFA title card */}
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <ShieldCheck size={32} className="text-primary" />
                                    </div>
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">{t('mfa.challengeTitle')}</h1>
                                    <p className="text-muted-foreground text-sm leading-relaxed">{t('mfa.challengeDesc')}</p>
                                </div>

                                {mfaError && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2"
                                    >
                                        <AlertCircle size={16} className="shrink-0" />
                                        {mfaError}
                                    </motion.div>
                                )}

                                <form onSubmit={handleMfaVerify} className="space-y-5">
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
                                        className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3.5 px-4 text-center text-xl font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                        autoFocus
                                    />

                                    <button
                                        type="submit"
                                        disabled={mfaCode.length !== 6 || mfaVerifying}
                                        className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {mfaVerifying ? (
                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <ShieldCheck size={18} />
                                                {t('mfa.verify')}
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleMfaBack}
                                        className="w-full text-muted-foreground text-sm font-medium flex items-center justify-center gap-1.5 hover:text-foreground transition-colors py-2"
                                    >
                                        <ArrowLeft size={14} />
                                        {t('mfa.back')}
                                    </button>
                                </form>
                            </motion.div>
                        ) : (
                            /* ══════════════════════════════════════════════════════ */
                            /* LOGIN FORM (Password or OTP)                            */
                            /* ══════════════════════════════════════════════════════ */
                            <motion.div
                                key="login"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >
                                {/* App branding */}
                                <div className="flex flex-col flex-center items-center -mt-2">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
                                        className="w-24 h-24 sm:w-28 sm:h-28 mb-4 relative flex items-center justify-center overflow-visible"
                                    >
                                        <img src="/elephant-logo.png" alt="App Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-center mb-10 z-10 relative"
                                    >
                                        <h2 className="text-xl font-bold tracking-tight text-foreground">{t('wild_elephant_monitoring')}</h2>
                                        <p className="text-muted-foreground mt-2 text-[15px] font-medium">जंगली हाथी निगरानी प्रणाली (2025)</p>
                                    </motion.div>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="text-center mb-8"
                                >
                                    <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{t('welcome_back')}</h1>
                                    <p className="text-muted-foreground text-sm">{t('login_subtitle')}</p>
                                </motion.div>

                                {/* ── Login Mode Tabs ───────────────────────────── */}
                                <div className="flex gap-2 mb-6 bg-muted/30 p-1 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={switchToPassword}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                                            loginMode === 'password'
                                                ? 'bg-primary text-primary-foreground shadow-md'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Lock size={16} />
                                        {t('otp.loginWithPassword')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={switchToOTP}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                                            loginMode === 'otp'
                                                ? 'bg-primary text-primary-foreground shadow-md'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Smartphone size={16} />
                                        {t('otp.loginWithOTP')}
                                    </button>
                                </div>

                                {/* ══════════════════════════════════════════════ */}
                                {/* PASSWORD LOGIN FORM                            */}
                                {/* ══════════════════════════════════════════════ */}
                                {loginMode === 'password' && (
                                    <>
                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2"
                                            >
                                                <AlertCircle size={16} className="shrink-0" />
                                                {error}
                                            </motion.div>
                                        )}

                                        <form onSubmit={handlePasswordLogin} className="space-y-5">
                                            <motion.div
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.4 }}
                                            >
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                        <Phone className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    </div>
                                                    <input
                                                        type="tel"
                                                        required
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                                        placeholder="+91 98765 43210"
                                                    />
                                                </div>
                                            </motion.div>

                                            <motion.div
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.5 }}
                                            >
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                        <Lock className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    </div>
                                                    <input
                                                        type="password"
                                                        required
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Rate-limit warning bar */}
                                            {attempts > 0 && !isLocked && (
                                                <p className="text-xs text-amber-500 text-center -mt-1">
                                                    {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining before temporary lockout
                                                </p>
                                            )}

                                            <motion.button
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.6 }}
                                                whileHover={{ scale: isLocked ? 1 : 1.02 }}
                                                whileTap={{ scale: isLocked ? 1 : 0.98 }}
                                                type="submit"
                                                disabled={isLoading || isLocked}
                                                className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 mt-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed group"
                                            >
                                                {isLoading ? (
                                                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : isLocked ? (
                                                    <>
                                                        <Timer className="w-5 h-5" />
                                                        Try again in {countdown}s
                                                    </>
                                                ) : (
                                                    <>
                                                        {t('sign_in')}
                                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                                    </>
                                                )}
                                            </motion.button>
                                        </form>
                                    </>
                                )}

                                {/* ══════════════════════════════════════════════ */}
                                {/* OTP LOGIN FORM                                 */}
                                {/* ══════════════════════════════════════════════ */}
                                {loginMode === 'otp' && (
                                    <>
                                        {otpError && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2"
                                            >
                                                <AlertCircle size={16} className="shrink-0" />
                                                {otpError}
                                            </motion.div>
                                        )}

                                        {otpStep === 'phone_entry' ? (
                                            /* ── OTP: Phone Entry Step ──────────── */
                                            <form onSubmit={handleSendOTP} className="space-y-5">
                                                <motion.div
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.4 }}
                                                    className="text-center mb-4"
                                                >
                                                    <p className="text-sm text-muted-foreground">{t('otp.subtitle')}</p>
                                                </motion.div>

                                                <motion.div
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.5 }}
                                                >
                                                                    {/* Locked +91 prefix + 10-digit input */}
                                                                    <div className="flex rounded-xl overflow-hidden border border-border bg-white/50 dark:bg-black/20 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
                                                                        <span className="inline-flex items-center px-3 bg-muted/70 border-r border-border text-sm font-bold text-foreground select-none shrink-0">
                                                                            +91
                                                                        </span>
                                                                        <input
                                                                            type="tel"
                                                                            required
                                                                            inputMode="numeric"
                                                                            maxLength={10}
                                                                            value={otpPhone}
                                                                            onChange={(e) => {
                                                                                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                                                setOtpPhone(digits);
                                                                                setOtpError(null);
                                                                            }}
                                                                            className="flex-1 py-3 px-4 text-sm outline-none bg-transparent"
                                                                            placeholder="9876543210"
                                                                            autoFocus
                                                                        />
                                                                    </div>
                                                </motion.div>

                                                <motion.button
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.6 }}
                                                    whileHover={{ scale: otpLoading ? 1 : 1.02 }}
                                                    whileTap={{ scale: otpLoading ? 1 : 0.98 }}
                                                    type="submit"
                                                    disabled={otpLoading}
                                                    className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed group"
                                                >
                                                    {otpLoading ? (
                                                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            {t('otp.sendCode')}
                                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                                        </>
                                                    )}
                                                </motion.button>
                                            </form>
                                        ) : (
                                            /* ── OTP: Verification Step ─────────── */
                                            <>
                                                <div className="text-center mb-6">
                                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                                                        <Smartphone size={32} className="text-primary" />
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-1">{t('otp.codeSent')}</p>
                                                    <p className="text-sm font-semibold text-foreground">{otpPhone}</p>
                                                </div>

                                                <form onSubmit={handleVerifyOTP} className="space-y-5">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        placeholder={t('otp.enterCode')}
                                                        value={otpCode}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                            setOtpCode(val);
                                                            setOtpError(null);
                                                        }}
                                                        className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3.5 px-4 text-center text-xl font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                                        autoFocus
                                                    />

                                                    <button
                                                        type="submit"
                                                        disabled={otpCode.length !== 6 || otpLoading}
                                                        className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed"
                                                    >
                                                        {otpLoading ? (
                                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <>
                                                                <ShieldCheck size={18} />
                                                                {t('otp.verify')}
                                                            </>
                                                        )}
                                                    </button>

                                                    {/* Resend OTP */}
                                                    <div className="text-center">
                                                        {otpResendCountdown > 0 ? (
                                                            <p className="text-sm text-muted-foreground">
                                                                {t('otp.resendIn')} {otpResendCountdown}s
                                                            </p>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={handleResendOTP}
                                                                disabled={otpLoading}
                                                                className="text-sm text-primary font-medium hover:underline disabled:opacity-50"
                                                            >
                                                                {t('otp.resend')}
                                                            </button>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={handleOtpBack}
                                                        className="w-full text-muted-foreground text-sm font-medium flex items-center justify-center gap-1.5 hover:text-foreground transition-colors py-2"
                                                    >
                                                        <ArrowLeft size={14} />
                                                        {t('otp.changePhone')}
                                                    </button>
                                                </form>
                                            </>
                                        )}
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
