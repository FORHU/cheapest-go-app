import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';

// Warn at server startup so a missing DSN is visible in Vercel logs immediately
// rather than being discovered only when an error is silently swallowed.
if (isProduction && !dsn) {
  console.error(
    '[Sentry] NEXT_PUBLIC_SENTRY_DSN is not set — error monitoring is DISABLED in production. ' +
    'Add the DSN to Vercel environment variables to enable Sentry.'
  );
}

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  enabled: isProduction && !!dsn,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      for (const field of ['password', 'card', 'cvv', 'ssn', 'token', 'secret']) {
        if (field in data) data[field] = '[Filtered]';
      }
    }
    return event;
  },
});
