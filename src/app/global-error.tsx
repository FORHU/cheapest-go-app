'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', maxWidth: '400px' }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.625rem 1.5rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '9999px', fontWeight: '500', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
