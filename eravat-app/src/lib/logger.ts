/**
 * Thin logging wrapper (QA M-6).
 *
 * - log / info / warn: emitted in dev builds only.
 * - error: always emits the static message so production failures leave a
 *   breadcrumb, but detail arguments (error objects, payloads, user IDs) are
 *   attached in dev builds only — they may contain PII.
 */
const DEV = import.meta.env.DEV;

export const logger = {
    log: (...args: unknown[]): void => {
        if (DEV) console.log(...args);
    },
    info: (...args: unknown[]): void => {
        if (DEV) console.info(...args);
    },
    warn: (...args: unknown[]): void => {
        if (DEV) console.warn(...args);
    },
    error: (message: string, ...detail: unknown[]): void => {
        if (DEV) {
            console.error(message, ...detail);
        } else {
            console.error(message);
        }
    },
};
