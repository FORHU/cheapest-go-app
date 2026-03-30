'use client';

import dynamic from 'next/dynamic';

// AuthModal pulls in framer-motion + all auth step components (~35 kB).
// Lazy-load so it's excluded from the initial bundle of every page
// and only downloaded when the user triggers the auth flow.
const AuthModal = dynamic(() => import('./AuthModal'), { ssr: false });

export default function AuthModalWrapper() {
    return <AuthModal />;
}
