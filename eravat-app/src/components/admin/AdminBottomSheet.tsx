import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Phone: bottom sheet. Desktop (sm+): centered modal.
 * Layout-only — no new copy; pass existing titles via children/header.
 */
export function AdminBottomSheet({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    testId,
    wide,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    testId?: string;
    /** Wider desktop max width (e.g. call logs). */
    wide?: boolean;
}) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            data-testid={testId}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className={`bg-card border border-border w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-md'} max-h-[90vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sm:hidden w-10 h-1 rounded-full bg-border mx-auto mt-2 shrink-0" aria-hidden />
                <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold truncate">{title}</h2>
                        {subtitle ? (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-muted shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
                {footer ? (
                    <div className="shrink-0 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-card">
                        {footer}
                    </div>
                ) : null}
            </motion.div>
        </div>
    );
}
