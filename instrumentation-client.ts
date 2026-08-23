import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Capture 10% of transactions for performance monitoring — raise after launch
  tracesSampleRate: 0.1,
  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',
  // Don't send PII in breadcrumbs
  sendDefaultPii: false,
});

// Required by @sentry/nextjs to instrument client-side App Router navigations —
// without it, route changes are not tied to a transaction and the SDK warns at startup.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
