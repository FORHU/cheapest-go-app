import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  sendDefaultPii: false,
  // Strip PII from request bodies before sending
  beforeSend(event) {
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      // Scrub payment and auth fields
      for (const field of ['password', 'card', 'cvv', 'ssn', 'token', 'secret']) {
        if (field in data) data[field] = '[Filtered]';
      }
    }
    return event;
  },
});
