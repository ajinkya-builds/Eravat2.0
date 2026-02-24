import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import elephantLogo from '../../public/elephant-logo.png';

export default function Login() {
    const navigate = useNavigate();
    const { signInWithPhone } = useAuth();
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { t } = useLanguage();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const { error } = await signInWithPhone(phone.trim(), password);

        if (error) {
            setError(error.message || 'Invalid phone number or password. Please try again.');
            setIsLoading(false);
        } else {
            navigate('/');
        }
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

                        <motion.button
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 mt-2 shadow-lg shadow-primary/25 disabled:opacity-70 disabled:cursor-not-allowed group"
                        >
                            {isLoading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {t('sign_in')}
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </motion.button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
