"use client";

import React, { useState, useEffect } from 'react';
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

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setSubmitted(true); // Permanently disable after first click

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/trips?payment=success`,
            },
            redirect: 'if_required',
        });

        if (error) {
            setMessage(error.message || "An unexpected error occurred.");
            setIsLoading(false);
        } else if (paymentIntent && (
            paymentIntent.status === 'succeeded' ||          // Duffel: automatic capture
            paymentIntent.status === 'requires_capture'      // Mystifly: manual capture (card held, not yet charged)
        )) {
            // Pass the PaymentIntent ID up so the parent can verify server-side
            // /api/flights/confirm handles both statuses correctly
            onSuccess(paymentIntent.id);
        } else {
            setMessage("Payment is processing...");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm mt-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Complete Payment</h2>

            <PaymentElement className="mb-6" />

            <button
                disabled={isLoading || submitted || !stripe || !elements}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold flex items-center justify-center gap-2"
            >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pay Now'}
            </button>

            {message && <div className="mt-4 text-sm text-red-500 text-center">{message}</div>}
        </form>
    );
}

export default function StripeEmbeddedCheckout({ clientSecret, onSuccess }: {
    clientSecret: string;
    onSuccess: (paymentIntentId: string) => void;
}) {
    // Clean up Stripe's floating badge/iframe elements when this component unmounts
    useEffect(() => {
        return () => {
            // Stripe.js injects floating iframes and divs into <body> that persist after unmount
            document.querySelectorAll(
                'iframe[name*="privateStripe"], iframe[name*="__stripe"], div[class*="__PrivateStripeElement"]'
            ).forEach(el => el.remove());
        };
    }, []);

    if (!clientSecret) return null;

    return (
        <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={getStripe()}>
            <CheckoutForm clientSecret={clientSecret} onSuccess={onSuccess} />
        </Elements>
    );
}
