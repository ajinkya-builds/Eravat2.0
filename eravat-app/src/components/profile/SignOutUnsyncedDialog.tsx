import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

type SignOutUnsyncedDialogProps = {
    open: boolean;
    count: number;
    busy: 'sync' | 'discard' | null;
    error: string | null;
    onSync: () => void;
    onDiscard: () => void;
    onCancel: () => void;
};

export default function SignOutUnsyncedDialog({
    open,
    count,
    busy,
    error,
    onSync,
    onDiscard,
    onCancel,
}: SignOutUnsyncedDialogProps) {
    const { t } = useLanguage();
    const locked = busy !== null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => {
                        if (!locked) onCancel();
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(event) => event.stopPropagation()}
                        className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-xl border border-border/50 space-y-4"
                        role="dialog"
                        aria-labelledby="sign-out-unsynced-title"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                                <AlertTriangle size={20} className="text-amber-600" />
                            </div>
                            <h3 id="sign-out-unsynced-title" className="text-lg font-bold text-foreground">
                                {t('profile.logoutUnsyncedTitle')}
                            </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {t('profile.logoutUnsyncedBody', { count })}
                        </p>
                        {error && (
                            <p className="text-sm text-destructive" role="alert">
                                {error}
                            </p>
                        )}
                        <div className="flex flex-col gap-2 pt-1">
                            <button
                                type="button"
                                onClick={onSync}
                                disabled={locked}
                                className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                            >
                                {busy === 'sync' ? t('profile.logoutUnsyncedSyncing') : t('profile.logoutSyncAndSignOut')}
                            </button>
                            <button
                                type="button"
                                onClick={onDiscard}
                                disabled={locked}
                                className="w-full py-2.5 px-4 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60"
                            >
                                {busy === 'discard' ? t('profile.logoutUnsyncedRemoving') : t('profile.logoutDiscardAndSignOut')}
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={locked}
                                className="w-full py-2.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
                            >
                                {t('profile.cancel')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
