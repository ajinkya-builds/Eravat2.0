import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle, ShieldCheck, ArrowLeft, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ELEPHANT_LOGO_URL } from '../lib/publicAsset';
import { track } from '../lib/analytics';

const OTP_RESEND_COOLDOWN_SEC = 60;

type OTPStep = 'phone_entry' | 'otp_verification';

export default function Login() {
    const navigate = useNavigate();
    const { signInWithPhoneOTP, verifyOTP, resendOTP, session, loading } = useAuth();
    const { t } = useLanguage();

    // ── OTP State ─────────────────────────────────────────────────────────────
    const [otpStep, setOtpStep] = useState<OTPStep>('phone_entry');
    const [otpPhone, setOtpPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState<string | null>(null);
    const [otpResendCountdown, setOtpResendCountdown] = useState(0);
    const otpResendRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        track('auth.login_opened');
    }, []);

    useEffect(() => {
        if (!loading && session) {
            navigate('/', { replace: true });
        }
    }, [loading, session, navigate]);

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

    if (loading || session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // OTP LOGIN HANDLERS
    // ══════════════════════════════════════════════════════════════════════════

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!otpPhone.trim() || otpPhone.trim().length < 10) {
            setOtpError(t('otp.invalidPhone'));
            return;
        }

        setOtpLoading(true);
        setOtpError(null);

        track('auth.phone_submitted');
        const { error, message } = await signInWithPhoneOTP(otpPhone.trim());

        if (error) {
            if (message === 'rate_limit') {
                setOtpError(t('otp.tooManyRequests'));
            } else if (message === 'user_not_found') {
                setOtpError(t('otp.notRegistered'));
            } else if (message === 'send_failed') {
                setOtpError(t('otp.sendFailed'));
            } else {
                setOtpError(t('otp.unexpected'));
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

        const { error } = await verifyOTP(otpPhone.trim(), otpCode);

        if (error) {
            setOtpError(t('otp.invalidCode'));
            setOtpLoading(false);
        } else {
            // Success — session persists natively; go straight into the app.
            setOtpLoading(false);
            navigate('/');
        }
    };

    const handleResendOTP = async () => {
        if (otpResendCountdown > 0) return;

        setOtpLoading(true);
        setOtpError(null);

        const { error } = await resendOTP(otpPhone.trim());

        if (error) {
            setOtpError(t('otp.sendFailed'));
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

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background pt-safe pb-safe">
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
                        {/* App branding */}
                        <div className="flex flex-col items-center -mt-2 mb-6">
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
                                className="w-20 h-20 mb-4 relative flex items-center justify-center overflow-visible"
                            >
                                <img src={ELEPHANT_LOGO_URL} alt="App Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-center"
                            >
                                <h1 className="text-lg font-bold tracking-tight text-foreground">{t('app_name')}</h1>
                            </motion.div>
                        </div>

                        {otpError && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2"
                            >
                                <AlertCircle size={16} className="shrink-0" />
                                <span className="font-medium text-xs">{otpError}</span>
                            </motion.div>
                        )}

                        {/* ── STEP 1: Phone Entry Step ──────────── */}
                        {otpStep === 'phone_entry' && (
                            <motion.div
                                key="phone_entry"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >
                                <div className="text-center mb-6">
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">{t('welcome_back')}</h1>
                                    <p className="text-muted-foreground text-xs">{t('otp.subtitle')}</p>
                                </div>

                                <form onSubmit={handleSendOTP} className="space-y-5">
                                    <div className="flex rounded-xl overflow-hidden border border-border bg-white/50 dark:bg-black/20 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
                                        <span className="inline-flex items-center px-4 bg-muted/70 border-r border-border text-sm font-bold text-foreground select-none shrink-0 font-outfit">
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
                                            className="flex-1 py-3.5 px-4 text-sm outline-none bg-transparent"
                                            placeholder="9876543210"
                                            data-testid="login-phone"
                                            autoFocus
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={otpLoading}
                                        className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed group cursor-pointer"
                                    >
                                        {otpLoading ? (
                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {t('otp.sendCode')}
                                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {/* ── STEP 2: OTP Verification Step ─────────── */}
                        {otpStep === 'otp_verification' && (
                            <motion.div
                                key="otp_verification"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >
                                <div className="text-center mb-6">
                                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <Smartphone size={28} className="text-primary" />
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-1">{t('otp.codeSent')}</p>
                                    <p className="text-sm font-semibold text-foreground font-outfit">+91 {otpPhone}</p>
                                </div>

                                <form onSubmit={handleVerifyOTP} className="space-y-5">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder={t('otp.enterCode')}
                                        data-testid="login-otp"
                                        value={otpCode}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                            setOtpCode(val);
                                            setOtpError(null);
                                        }}
                                        className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3 px-4 text-center text-lg font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                        autoFocus
                                    />

                                    <button
                                        type="submit"
                                        disabled={otpCode.length !== 6 || otpLoading}
                                        className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
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
                                            <p className="text-xs text-muted-foreground">
                                                {t('otp.resendIn')} {otpResendCountdown}s
                                            </p>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleResendOTP}
                                                disabled={otpLoading}
                                                className="text-xs text-primary font-medium hover:underline disabled:opacity-50 cursor-pointer"
                                            >
                                                {t('otp.resend')}
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleOtpBack}
                                        className="w-full text-muted-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:text-foreground transition-colors py-2 cursor-pointer"
                                    >
                                        <ArrowLeft size={14} />
                                        {t('otp.changePhone')}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
