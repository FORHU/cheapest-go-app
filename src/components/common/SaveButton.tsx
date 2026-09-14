'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/stores/authStore';
import { loginUrlFor } from '@/lib/auth/returnTo';

/**
 * A heart clicked while signed out. Sign-in used to be a dead end — `/login` with no `next`,
 * so the visitor landed somewhere else and the item was never saved (QA BG-7). Now they come
 * back to the page they were on, and the heart they clicked finishes saving. Session storage:
 * it belongs to this tab's sign-in detour, not to the browser.
 */
const PENDING_SAVE_KEY = 'cheapestgo-pending-save';

function sendToLogin(router: ReturnType<typeof useRouter>, deepLink: string) {
    try { sessionStorage.setItem(PENDING_SAVE_KEY, deepLink); } catch { /* still worth signing in */ }
    router.push(loginUrlFor(window.location.pathname + window.location.search));
}

interface SaveButtonProps {
    type: 'flight' | 'hotel';
    title: string;
    subtitle?: string;
    price?: number;
    currency?: string;
    imageUrl?: string;
    deepLink: string;
    snapshot?: Record<string, unknown>;
    size?: 'sm' | 'md';
    className?: string;
}

// One saved-trips fetch shared by every heart on the page — per account, so a list fetched
// signed out (empty) is not what the hearts check against after signing in.
let tripsPromise: Promise<any> | null = null;
let tripsPromiseFor: string | null = null;

export default function SaveButton({
    type, title, subtitle, price, currency = 'USD',
    imageUrl, deepLink, snapshot, size = 'md', className = '',
}: SaveButtonProps) {
    const [saved, setSaved] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false); // has the initial check run?

    const router = useRouter();
    const user = useUser();

    // On mount, check if this item is already saved
    useEffect(() => {
        let cancelled = false;
        // Not "checked" again until this account's list is in, or the pending save below
        // could re-save something that is already saved.
        setChecked(false);
        (async () => {
            try {
                if (!tripsPromise || tripsPromiseFor !== (user?.id ?? null)) {
                    tripsPromiseFor = user?.id ?? null;
                    tripsPromise = fetch('/api/saved-trips').then(r => r.ok ? r.json() : { data: [] });
                }
                const json = await tripsPromise;
                const match = (json.data ?? []).find((t: any) => t.deep_link === deepLink);
                if (!cancelled) {
                    setSaved(!!match);
                    setSavedId(match?.id ?? null);
                    setChecked(true);
                }
            } catch { if (!cancelled) setChecked(true); }
        })();
        return () => { cancelled = true; };
    }, [deepLink, user?.id]);

    // Back from signing in: finish the save this heart started (see PENDING_SAVE_KEY).
    useEffect(() => {
        if (!user || !checked) return;
        let pending: string | null = null;
        try { pending = sessionStorage.getItem(PENDING_SAVE_KEY); } catch { return; }
        if (pending !== deepLink) return;
        try { sessionStorage.removeItem(PENDING_SAVE_KEY); } catch { /* ignore */ }
        if (!saved) void persist(false, null);
    }, [user, checked, deepLink]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) {
            sendToLogin(router, deepLink);
            return;
        }

        if (loading || !checked) return;
        await persist(saved, savedId);
    };

    const persist = async (previousSaved: boolean, previousSavedId: string | null) => {

        // Optimistic update
        setSaved(!previousSaved);
        setLoading(true);

        try {
            if (previousSaved && previousSavedId) {
                const res = await fetch(`/api/saved-trips/${previousSavedId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
                setSavedId(null);
            } else {
                const res = await fetch('/api/saved-trips', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, title, subtitle, price, currency, image_url: imageUrl, deep_link: deepLink, snapshot }),
                });

                if (res.status === 401) {
                    setSaved(previousSaved);
                    sendToLogin(router, deepLink);
                    return;
                }

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(err.error || `Save failed: ${res.status}`);
                }

                const json = await res.json();
                if (json.success) {
                    setSavedId(json.data?.id ?? null);
                }
            }
        } catch (error) {
            console.error('[SaveButton] Error:', error);
            // Revert on error
            setSaved(previousSaved);
            setSavedId(previousSavedId);
        } finally { 
            setLoading(false); 
        }
    };

    const iconSize = size === 'sm' ? 14 : 16;
    const btnSize = size === 'sm'
        ? 'w-7 h-7'
        : 'w-8 h-8';

    return (
        <button
            onClick={toggle}
            disabled={loading || !checked}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            className={`${btnSize} flex items-center justify-center rounded-full transition-all
                ${saved
                    ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                    : 'bg-white/80 dark:bg-slate-800/80 text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                }
                ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                shadow-sm backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60
                active:scale-90
                ${className}
            `}
        >
            <Heart
                size={iconSize}
                className={`transition-all ${saved ? 'fill-rose-500' : 'fill-none'}`}
            />
        </button>
    );
}
