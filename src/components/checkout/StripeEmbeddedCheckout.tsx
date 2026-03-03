"use client";

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutForm({ clientSecret, onSuccess }: { clientSecret: string, onSuccess: () => void }) {
    const stripe = useStripe();
    const elements = useElements();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsLoading(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Since this is embedded, we do NOT want it to redirect automatically.
                // We'll handle the success state ourselves if redirect is 'if_required'.
                // If 'always', the page will definitely redirect. 
                // However, `confirmPayment` defaults to redirect 'always' for certain methods.
                return_url: `${window.location.origin}/trips?payment=success`,
            },
            redirect: 'if_required',
        });

        if (error) {
            setMessage(error.message || "An unexpected error occurred.");
            setIsLoading(false);
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            onSuccess();
        } else {
            // Can be 'processing' or other states.
            setMessage("Payment is processing...");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm mt-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Complete Payment</h2>

            <PaymentElement className="mb-6" />

            <button
                disabled={isLoading || !stripe || !elements}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold flex items-center justify-center gap-2"
            >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pay Now'}
            </button>

            {message && <div className="mt-4 text-sm text-red-500 text-center">{message}</div>}
        </form>
    );
}

export default function StripeEmbeddedCheckout({ clientSecret, onSuccess }: { clientSecret: string, onSuccess: () => void }) {
    if (!clientSecret) return null;

    return (
        <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
            <CheckoutForm clientSecret={clientSecret} onSuccess={onSuccess} />
        </Elements>
    );
}
