'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2, Check } from 'lucide-react';

interface PriceAlertButtonProps {
    origin: string;
    destination: string;
    adults?: number;
    cabin?: string;
}

type AlertState = 'idle' | 'loading' | 'active' | 'error';

export default function PriceAlertButton({
    origin,
    destination,
    adults = 1,
    cabin = 'economy',
}: PriceAlertButtonProps) {
    const [state, setState] = useState<AlertState>('loading');
    const [alertId, setAlertId] = useState<string | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
    const [feedback, setFeedback] = useState('');

    // Check if user already has an alert for this route
    useEffect(() => {
        let cancelled = false;
        async function checkExisting() {
            try {
                const res = await fetch('/api/price-alerts');
                if (res.status === 401) {
                    if (!cancelled) { setIsLoggedIn(false); setState('idle'); }
                    return;
                }
                if (!cancelled) setIsLoggedIn(true);
                const json = await res.json();
                const existing = (json.data ?? []).find((a: any) =>
                    a.origin === origin &&
                    a.destination === destination &&
                    a.adults === adults &&
                    a.cabin_class === cabin &&
                    a.is_active
                );
                if (!cancelled) {
                    if (existing) { setAlertId(existing.id); setState('active'); }
                    else setState('idle');
                }
            } catch {
                if (!cancelled) setState('idle');
            }
        }
        checkExisting();
        return () => { cancelled = true; };
    }, [origin, destination, adults, cabin]);

    const createAlert = async () => {
        setState('loading');
        try {
            const res = await fetch('/api/price-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin, destination, cabin_class: cabin, adults }),
            });
            if (res.status === 401) {
                setFeedback('Sign in to set price alerts');
                setState('idle');
                setTimeout(() => setFeedback(''), 3000);
                return;
            }
            const json = await res.json();
            if (json.success) {
                setAlertId(json.data.id);
                setState('active');
                setFeedback("Alert on! We'll email you when prices drop.");
                setTimeout(() => setFeedback(''), 4000);
            } else {
                setFeedback(json.error ?? 'Failed to set alert');
                setState('idle');
                setTimeout(() => setFeedback(''), 3000);
            }
        } catch {
            setState('error');
            setTimeout(() => setState('idle'), 2000);
        }
    };

    const removeAlert = async () => {
        if (!alertId) return;
        setState('loading');
        try {
            await fetch(`/api/price-alerts/${alertId}`, { method: 'DELETE' });
            setAlertId(null);
            setState('idle');
            setFeedback('Alert removed');
            setTimeout(() => setFeedback(''), 2000);
        } catch {
            setState('active');
        }
    };

    // Don't render for unauthenticated until we know
    if (isLoggedIn === false) {
        return (
            <button
                onClick={() => { setFeedback('Sign in to set price alerts'); setTimeout(() => setFeedback(''), 3000); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 transition-colors"
                title="Sign in to set price alerts"
            >
                <Bell size={13} />
                Track price
                {feedback && <span className="ml-1 text-amber-600 dark:text-amber-400">{feedback}</span>}
            </button>
        );
    }

    if (state === 'loading') {
        return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-400">
                <Loader2 size={13} className="animate-spin" />
                <span>Loading...</span>
            </div>
        );
    }

    if (state === 'active') {
        return (
            <div className="flex items-center gap-1.5">
                <button
                    onClick={removeAlert}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    title="Remove price alert"
                >
                    <BellOff size={13} />
                    Alert active
                </button>
                {feedback && <span className="text-xs text-emerald-600 dark:text-emerald-400">{feedback}</span>}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            <button
                onClick={createAlert}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 transition-colors"
                title="Get email when price drops"
            >
                <Bell size={13} />
                Track price
            </button>
            {feedback && (
                <span className={`text-xs flex items-center gap-1 ${feedback.startsWith('Alert on') ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                    {feedback.startsWith('Alert on') && <Check size={11} />}
                    {feedback}
                </span>
            )}
        </div>
    );
}
