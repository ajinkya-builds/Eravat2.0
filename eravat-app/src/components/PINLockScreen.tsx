import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Delete, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ELEPHANT_LOGO_URL } from '../lib/publicAsset';

export default function PINLockScreen() {
    const { unlockWithPIN, resetPIN } = useAuth();
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shake, setShake] = useState(false);

    const handleKeyPress = (num: string) => {
        if (isSubmitting) return;
        setError(null);
        if (pin.length < 4) {
            const newPin = pin + num;
            setPin(newPin);
            if (newPin.length === 4) {
                void handleSubmit(newPin);
            }
        }
    };

    const handleDelete = () => {
        if (isSubmitting) return;
        setError(null);
        setPin(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
        if (isSubmitting) return;
        setError(null);
        setPin('');
    };

    const handleSubmit = async (enteredPin: string) => {
        setIsSubmitting(true);
        setError(null);

        const { error: unlockError } = await unlockWithPIN(enteredPin);

        if (unlockError) {
            setShake(true);
            setError(unlockError.message || 'Invalid PIN');
            setPin('');
            setIsSubmitting(false);
            // Reset shake animation after 500ms
            setTimeout(() => setShake(false), 500);
        } else {
            setIsSubmitting(false);
        }
    };

    const handleForgotPIN = () => {
        const confirmMessage = "Resetting your PIN requires an active internet connection and will clear your local cached data. Are you sure you want to proceed?";
        if (window.confirm(confirmMessage)) {
            void resetPIN();
        }
    };

    return (
        <div className="flex flex-col items-center justify-between min-h-screen bg-background text-foreground px-6 py-12 select-none">
            {/* Logo and Header */}
            <div className="flex flex-col items-center gap-4 mt-8">
                <img 
                    src={ELEPHANT_LOGO_URL} 
                    alt="Eravat Logo" 
                    className="w-16 h-16 object-contain"
                />
                <h1 className="text-2xl font-bold tracking-wide font-outfit text-primary">ERAVAT 2.0</h1>
                <p className="text-muted-foreground text-sm text-center">
                    Madhya Pradesh Forest Department
                </p>
            </div>

            {/* PIN Entry Visualizer */}
            <div className="flex flex-col items-center gap-6 w-full max-w-xs">
                <div className="flex items-center justify-center gap-2 text-primary">
                    <Lock size={18} className="animate-pulse" />
                    <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Enter Security PIN
                    </span>
                </div>

                <motion.div 
                    animate={shake ? { x: [-10, 10, -10, 10, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className="flex justify-center gap-6 my-4"
                >
                    {[0, 1, 2, 3].map((index) => (
                        <div 
                            key={index}
                            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                                pin.length > index 
                                    ? 'bg-primary border-primary scale-125 shadow-lg shadow-primary/30' 
                                    : 'border-muted-foreground/30 bg-transparent'
                            }`}
                        />
                    ))}
                </motion.div>

                <div className="h-6 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="flex items-center gap-2 text-destructive text-sm font-medium"
                            >
                                <AlertCircle size={14} />
                                <span>{error}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Numeric Keypad Grid */}
            <div className="w-full max-w-sm flex flex-col gap-4 mt-4">
                <div className="grid grid-cols-3 gap-3 justify-items-center">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => handleKeyPress(num)}
                            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold bg-secondary/35 border border-secondary/20 hover:bg-secondary/60 active:scale-95 transition-all cursor-pointer font-outfit"
                        >
                            {num}
                        </button>
                    ))}
                    
                    <button
                        type="button"
                        onClick={handleClear}
                        className="w-20 h-20 rounded-full flex items-center justify-center text-sm font-medium text-muted-foreground hover:bg-secondary/20 active:scale-95 transition-all cursor-pointer font-outfit"
                    >
                        Clear
                    </button>
                    
                    <button
                        type="button"
                        onClick={() => handleKeyPress('0')}
                        className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold bg-secondary/35 border border-secondary/20 hover:bg-secondary/60 active:scale-95 transition-all cursor-pointer font-outfit"
                    >
                        0
                    </button>
                    
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="w-20 h-20 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary/20 active:scale-95 transition-all cursor-pointer"
                    >
                        <Delete size={22} />
                    </button>
                </div>

                <div className="text-center mt-6">
                    <button
                        type="button"
                        onClick={handleForgotPIN}
                        className="text-xs font-semibold text-primary/80 hover:text-primary transition-all cursor-pointer hover:underline"
                    >
                        Forgot PIN?
                    </button>
                </div>
            </div>
        </div>
    );
}
