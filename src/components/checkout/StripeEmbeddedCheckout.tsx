"use client";

import React, { useState } from 'react';
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

function CheckoutForm({ clientSecret, onSuccess, returnUrl }: {
    clientSecret: string;
    onSuccess: (paymentIntentId: string) => void;
    returnUrl?: string;
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

        // Come back to the page that started this payment.
        //
        // This was hardcoded to `/checkout`, which is the HOTEL checkout — and this
        // component is shared with flight booking. Any payment method that forces a
        // full redirect (bank redirects, some 3DS challenges) therefore dropped flight
        // customers onto the hotel page: no confirmation, no PNR, and the client-side
        // poll that finalises the booking never ran.
        const fallbackReturn = typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}${window.location.search}`
            : undefined;

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: returnUrl ?? fallbackReturn,
            },
            redirect: 'if_required',
        });

        if (error) {
            setMessage(error.message || t('stripe.unexpectedError'));
            setIsLoading(false);
            setSubmitted(false);
        } else if (paymentIntent && (
            paymentIntent.status === 'succeeded' ||
            paymentIntent.status === 'requires_capture'
        )) {
            onSuccess(paymentIntent.id);
        } else {
            // `processing` and friends: the payment is neither done nor refused. Do not
            // leave the button disabled — that was a dead end with no way forward and
            // no way to retry, on a page the customer had already paid from.
            setMessage(t('stripe.processing'));
            setIsLoading(false);
            setSubmitted(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm mt-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">{t('stripe.completePayment')}</h2>

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

export default function StripeEmbeddedCheckout({ clientSecret, onSuccess, returnUrl }: {
    clientSecret: string;
    onSuccess: (paymentIntentId: string) => void;
    /** Where Stripe should return to if the payment method forces a redirect.
     *  Defaults to the current page, which is right for every caller. */
    returnUrl?: string;
}) {
    // Stripe's controller iframes (__privateStripeController,
    // __privateStripeMetricsController) are appended to <body> by Stripe.js and are
    // meant to outlive any single Elements instance — it reuses them for the whole page
    // and keeps posting to them after we unmount.
    //
    // This used to sweep them out of the DOM on unmount, which is what produced:
    //
    //   Failed to execute 'postMessage' on 'DOMWindow': The target origin provided
    //   ('https://js.stripe.com') does not match the recipient window's origin
    //   ('https://cheapestgo.com')
    //
    // Detaching an iframe swaps its contentWindow for a blank same-origin one, so
    // Stripe's next message — addressed to js.stripe.com — lands on our own origin and
    // throws. The iframes are 0x0 and invisible; leaving them alone is correct. The
    // Element iframes we actually own live inside the React tree and unmount with it.

    if (!clientSecret) return null;

    return (
        <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={getStripe()}>
            <CheckoutForm clientSecret={clientSecret} onSuccess={onSuccess} returnUrl={returnUrl} />
        </Elements>
    );
}
