import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, ArrowRight, AlertCircle, Timer, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabase';
import elephantLogo from '../../public/elephant-logo.png';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;

export default function Login() {
    const navigate = useNavigate();
    const { signInWithPhone, signOut } = useAuth();
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [lockUntil, setLockUntil] = useState<number | null>(null);
    const [countdown, setCountdown] = useState(0);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { t } = useLanguage();

    // MFA challenge state
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [mfaVerifying, setMfaVerifying] = useState(false);

    // Countdown timer for rate-limit lock
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

    const isLocked = lockUntil !== null && Date.now() < lockUntil;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLocked) return;
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
                            /* ── MFA Challenge Form ── */
                            <motion.div
                                key="mfa"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                {/* Compact app branding */}
                                <div className="flex items-center justify-center gap-2 mb-6">
                                    <div className="w-8 h-8 relative flex items-center justify-center overflow-visible">
                                        <img src={elephantLogo} alt="App Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain" />
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
                            /* ── Login Form ── */
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
                                        <img src={elephantLogo} alt="App Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
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

                                <form onSubmit={handleLogin} className="space-y-5">
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
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
