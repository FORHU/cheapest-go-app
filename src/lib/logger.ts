/**
 * Lightweight structured logger.
 * - In production: emits JSON lines (picked up by Vercel log drain / Datadog)
 * - In development: pretty-prints with colour prefixes
 *
 * Drop-in replacement for console.log/error/warn in server-side code.
 * Client components should still use console.* directly (this file is server-only).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const isProd = process.env.NODE_ENV === 'production';

function emit(level: Level, message: string, meta?: Meta) {
    const entry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
    };

    if (isProd) {
        // Structured JSON for log aggregation tools
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(JSON.stringify(entry));
    } else {
        const prefix: Record<Level, string> = {
            debug: '🔍',
            info:  '📋',
            warn:  '⚠️ ',
            error: '🔴',
        };
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(`${prefix[level]} [${message}]`, meta ?? '');
    }
}

export const logger = {
    debug: (message: string, meta?: Meta) => emit('debug', message, meta),
    info:  (message: string, meta?: Meta) => emit('info',  message, meta),
    warn:  (message: string, meta?: Meta) => emit('warn',  message, meta),
    error: (message: string, meta?: Meta) => emit('error', message, meta),
};
