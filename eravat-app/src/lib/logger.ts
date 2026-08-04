import { captureException } from './posthogClient';

type LogContext = Record<string, unknown>;

function formatArgs(scope: string, message: string, context?: LogContext): unknown[] {
  if (context && Object.keys(context).length > 0) {
    return [`[${scope}] ${message}`, context];
  }
  return [`[${scope}] ${message}`];
}

/**
 * Structured logger: console always (errors/warns); remote errors via PostHog when configured.
 */
export const logger = {
  debug(scope: string, message: string, context?: LogContext) {
    if (import.meta.env.DEV) {
      console.debug(...formatArgs(scope, message, context));
    }
  },

  info(scope: string, message: string, context?: LogContext) {
    if (import.meta.env.DEV) {
      console.info(...formatArgs(scope, message, context));
    }
  },

  warn(scope: string, message: string, context?: LogContext) {
    console.warn(...formatArgs(scope, message, context));
  },

  error(scope: string, message: string, error?: unknown, context?: LogContext) {
    console.error(...formatArgs(scope, message, { ...context, error }));
    const err = error instanceof Error ? error : new Error(message);
    captureException(err, {
      scope,
      log_message: message,
      feature: scope,
      ...context,
    });
  },
};
