"use client";

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';

import { env } from '@/utils/env';

let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripe() {
    if (!stripePromise) {
        stripePromise = loadStripe(env.STRIPE_PUBLIC_KEY!);
    }
    return stripePromise;
}

function CheckoutForm({ clientSecret, onSuccess }: {
    clientSecret: string;
    onSuccess: (paymentIntentId: string) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();

    const t = useTranslations('checkout');
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setSubmitted(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/trips?payment=success`,
            },
            redirect: 'if_required',
        });

        if (error) {
            setMessage(error.message || t('stripe.unexpectedError'));
            setIsLoading(false);
        } else if (paymentIntent && (
            paymentIntent.status === 'succeeded' ||
            paymentIntent.status === 'requires_capture'
        )) {
            onSuccess(paymentIntent.id);
        } else {
            setMessage(t('stripe.processing'));
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm mt-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">{tsc('stripe.completePayment')}</h2>

            <PaymentElement
                className="mb-4"
                options={{ layout: 'accordion' }}
                onLoadError={(event) => {
                    console.error('[stripe] PaymentElement load error:', event.elementType, event.error);
                    setMessage(
                        (event.error as any)?.message ||
                        t('stripe.loadError')
                    );
                }}
            />

            <button
                disabled={isLoading || submitted || !stripe || !elements}
                className="w-full py-2 sm:py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('stripe.payNow')}
            </button>

            {message && <div className="mt-3 text-xs text-red-500 text-center">{message}</div>}
        </form>
    );
}

export default function StripeEmbeddedCheckout({ clientSecret, onSuccess }: {
    clientSecret: string;
    onSuccess: (paymentIntentId: string) => void;
}) {
    // Remove Stripe's floating iframes from <body> on true unmount.
    // Guard with a 300ms timer so React Strict Mode's synthetic first-mount cleanup
    // (which runs synchronously before re-mount) doesn't yank iframes mid-init.
    useEffect(() => {
        let settled = false;
        const timer = setTimeout(() => { settled = true; }, 300);
        return () => {
            clearTimeout(timer);
            if (settled) {
                document.querySelectorAll(
                    'iframe[name*="privateStripe"], iframe[name*="__stripe"], div[class*="__PrivateStripeElement"]'
                ).forEach(el => el.remove());
            }
        };
    }, []);

    if (!clientSecret) return null;

    return (
        <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={getStripe()}>
            <CheckoutForm clientSecret={clientSecret} onSuccess={onSuccess} />
        </Elements>
    );
}
