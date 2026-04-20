'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';

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

let tripsPromise: Promise<any> | null = null;

export default function SaveButton({
    type, title, subtitle, price, currency = 'USD',
    imageUrl, deepLink, snapshot, size = 'md', className = '',
}: SaveButtonProps) {
    const [saved, setSaved] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false); // has the initial check run?

    // On mount, check if this item is already saved
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!tripsPromise) {
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
    }, [deepLink]);

    const toggle = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (loading) return;
        setLoading(true);

        try {
            if (saved && savedId) {
                await fetch(`/api/saved-trips/${savedId}`, { method: 'DELETE' });
                setSaved(false);
                setSavedId(null);
            } else {
                const res = await fetch('/api/saved-trips', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, title, subtitle, price, currency, image_url: imageUrl, deep_link: deepLink, snapshot }),
                });
                if (res.status === 401) {
                    // Not logged in — could show a toast here
                    return;
                }
                const json = await res.json();
                if (json.success) {
                    setSaved(true);
                    setSavedId(json.data?.id ?? null);
                }
            }
        } finally { setLoading(false); }
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
