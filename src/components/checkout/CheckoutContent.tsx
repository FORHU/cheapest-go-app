"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    useProperty,
    useSelectedRoom,
    useBookingDates,
    useGuestCount,
    useBookingId,
    useBookingStore,
} from '@/stores/bookingStore';
import { useAuthStore, useUser } from '@/stores/authStore';
import {
    useVoucherState,
    useCheckoutActions,
} from '@/stores/checkoutStore';
import { useUserCurrency } from '@/stores/searchStore';
import {
    useBookingFlow,
    useCheckoutForm,
    useCheckoutPrebook,
    usePricingCalculation,
} from '@/hooks';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { AlertTriangle, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/common/BackButton';
import AuthModal from '@/components/auth/AuthModal';
import { validateCheckoutForm, buildGuestPayload, buildHolderPayload } from '@/lib/server/checkout';
import {
    BookingSuccess,
    UserDetailsForm,
    BookingForSection,
    SpecialRequestsSection,
    BookingSummary,
    SubmitBookingButton,
    VoucherInput,
    AvailablePromos,
} from '@/components/checkout';
import dynamic from 'next/dynamic';

// Stripe JS (~60 kB) is only needed when the user reaches the payment step.
// Lazy-load so it doesn't inflate the initial checkout page bundle.
const StripeEmbeddedCheckout = dynamic(
    () => import('@/components/checkout/StripeEmbeddedCheckout'),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-48">
                <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
        ),
    }
);

const BOOKING_STEPS = [
    'Verifying payment...',
    'Securing your reservation...',
    'Confirming with the hotel...',
    'Finalizing booking details...',
] as const;

export function CheckoutContent() {
    const router = useRouter();

    // Booking store selectors
    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();
    const { adults, children } = useGuestCount();
    const bookingId = useBookingId();

    // Auth state
    const user = useUser();
    const { openAuthModal, isAuthModalOpen } = useAuthStore();

    // Voucher state (display only — values from server)
    const { appliedVoucher } = useVoucherState();

    // Booking flow hook
    const {
        prebookId,
        priceData,
        isPrebooking: prebooking,
        isBooking: loading,
        prebookError: prebookErrorObj,
        startPrebook,
        completeBooking,
        reprebookWithVoucher,
        reprebookWithoutVoucher,
    } = useBookingFlow();

    // Form state hook
    const {
        formData,
        handleInputChange,
        bookingFor,
        setBookingFor,
        isWorkTravel,
        setIsWorkTravel,
        specialRequests,
        setSpecialRequests,
        phoneCountryCode,
        setPhoneCountryCode,
        selectedCurrency,
        isSuccess,
        setIsSuccess,
        emailSent,
        setEmailSent,
        formErrors,
        setFormErrors,
        clearFormErrors,
    } = useCheckoutForm();

    const prebookError = prebookErrorObj?.message || null;

    // Stripe payment step state
    const [step, setStep] = useState<'form' | 'payment'>('form');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [isCreatingPayment, setIsCreatingPayment] = useState(false);

    // Duplicate booking warning dialog state
    const [duplicateBooking, setDuplicateBooking] = useState<{
        existingBookingId: string;
        existingCheckIn?: string;
        existingCheckOut?: string;
    } | null>(null);

    // Booking confirmation progress overlay
    const [bookingStepIdx, setBookingStepIdx] = useState(0);
    const bookingStepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (loading && step === 'payment') {
            setBookingStepIdx(0);
            bookingStepTimer.current = setInterval(() => {
                setBookingStepIdx((i) => Math.min(i + 1, BOOKING_STEPS.length - 1));
            }, 4000);
        } else {
            if (bookingStepTimer.current) {
                clearInterval(bookingStepTimer.current);
                bookingStepTimer.current = null;
            }
        }
        return () => {
            if (bookingStepTimer.current) clearInterval(bookingStepTimer.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, step]);

    // Global currency sync
    const globalCurrency = useUserCurrency();
    const { syncWithUserCurrency } = useCheckoutActions();

    const searchParams = useSearchParams();
    // Present when user arrived from the post-flight-booking bundle upsell → triggers 12% bundle rate
    const bundleFlightIdFromUrl = searchParams.get('bundleFlightId') || undefined;
    
    // Save locally so it survives re-renders after we wipe sessionStorage on success
    const [bundleFlightId, setBundleFlightId] = useState<string | undefined>(undefined);

    // Persist to sessionStorage so it survives Stripe redirect (URL params are lost after payment)
    useEffect(() => {
        const stored = typeof window !== 'undefined' ? sessionStorage.getItem('bundleFlightId') : undefined;
        if (bundleFlightIdFromUrl) {
            sessionStorage.setItem('bundleFlightId', bundleFlightIdFromUrl);
            setBundleFlightId(bundleFlightIdFromUrl);
        } else if (stored) {
            setBundleFlightId(stored);
        }
    }, [bundleFlightIdFromUrl]);

    useEffect(() => {
        // Sync currency from URL whenever it changes
        const urlCurrency = searchParams.get('currency');
        if (urlCurrency && urlCurrency !== selectedCurrency) {
            syncWithUserCurrency(urlCurrency);
        } else if (!urlCurrency) {
            // Only sync from global if no URL override is present
            syncWithUserCurrency(globalCurrency);
        }
    }, [globalCurrency, syncWithUserCurrency, searchParams, selectedCurrency]);

    // Reset success state from previous booking on mount
    useEffect(() => {
        setIsSuccess(false);
        setEmailSent(false);

        // Sync currency from URL if present (initial load priority)
        const urlParams = new URLSearchParams(window.location.search);
        const urlCurrency = urlParams.get('currency');
        if (urlCurrency && urlCurrency !== selectedCurrency) {
            syncWithUserCurrency(urlCurrency);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Prebook trigger hook (handles mount, currency change, auth retry)
    const { retryPrebook } = useCheckoutPrebook({
        selectedCurrency,
        startPrebook,
        prebookError,
    });

    // Pricing calculation hook
    const { displayProperty, displayRoom, totalNights, roomPrice, taxes, totalPrice } = usePricingCalculation({
        priceData,
    });

    // Send confirmation email via API route
    const sendConfirmationEmail = useCallback(async (bookingDetails: {
        bookingId: string;
        email: string;
        guestName: string;
        hotelName: string;
        roomName: string;
        checkIn: string;
        checkOut: string;
        totalPrice: number;
        currency: string;
    }) => {
        try {
            const result = await apiFetch('/api/email', bookingDetails);
            if (result.success) setEmailSent(true);
        } catch (err) {
            console.error("Failed to send confirmation email:", err);
        }
    }, [setEmailSent]);

    // Step 1: Validate form → create Stripe PaymentIntent → show payment UI
    const handleProceedToPayment = useCallback(async () => {
        if (!user) {
            const redirectPath = window.location.pathname + window.location.search;
            openAuthModal('email', redirectPath);
            return;
        }

        // Validate form fields using server utility
        clearFormErrors();
        const validation = validateCheckoutForm(formData, bookingFor);
        if (!validation.success) {
            setFormErrors(validation.errors);
            toast.error('Please fix the highlighted fields before continuing.');
            return;
        }

        if (!prebookId || !selectedRoom?.offerId) {
            toast.error("Booking session expired. Please go back and select the room again.");
            return;
        }

        // Always charge in selectedCurrency using the converted totalPrice.
        // priceData.total is LiteAPI's raw amount (may be in IDR, USD, etc.) —
        // using it directly with selectedCurrency would mismatch currency + amount.
        const chargeAmount = appliedVoucher
            ? appliedVoucher.finalPrice
            : totalPrice;

        if (!chargeAmount || chargeAmount <= 0) {
            toast.error("Invalid booking price. Please retry.");
            return;
        }

        setIsCreatingPayment(true);
        try {
            const result = await apiFetch<{ clientSecret: string; paymentIntentId: string }>(
                '/api/booking/create-payment',
                {
                    prebookId,
                    amount: chargeAmount,
                    currency: selectedCurrency,
                    holderEmail: formData.email,
                    propertyName: property?.name || 'Hotel',
                    roomName: selectedRoom?.title || 'Room',
                    checkIn: checkIn?.toISOString().slice(0, 10),
                    checkOut: checkOut?.toISOString().slice(0, 10),
                    ...(bundleFlightId ? { bundleFlightId } : {}),
                }
            );

            if (!result.success) {
                const raw = result as unknown as Record<string, unknown>;
                if (raw.code === 'DUPLICATE_BOOKING' && typeof raw.existingBookingId === 'string') {
                    setDuplicateBooking({
                        existingBookingId: raw.existingBookingId,
                        existingCheckIn: typeof raw.existingCheckIn === 'string' ? raw.existingCheckIn : undefined,
                        existingCheckOut: typeof raw.existingCheckOut === 'string' ? raw.existingCheckOut : undefined,
                    });
                    return;
                }
                throw new Error('error' in result ? result.error : 'Failed to create payment session');
            }

            if (!result.data?.clientSecret) {
                throw new Error('Failed to create payment session');
            }

            setClientSecret(result.data.clientSecret);
            setStep('payment');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Payment setup failed';
            toast.error(message);
        } finally {
            setIsCreatingPayment(false);
        }
    }, [user, prebookId, selectedRoom, formData, bookingFor, priceData, selectedCurrency, property, openAuthModal, totalPrice, clearFormErrors, setFormErrors, appliedVoucher, bundleFlightId]);

    // Step 2: After Stripe payment succeeds → confirm with LiteAPI
    const handlePaymentSuccess = useCallback(async (stripePaymentIntentId: string) => {
        try {
            if (!prebookId || !selectedRoom?.offerId) {
                throw new Error("Booking session expired.");
            }

            const guests = buildGuestPayload(formData, bookingFor, specialRequests);
            const holder = buildHolderPayload(formData);

            // Confirm booking with LiteAPI (payment already captured by Stripe)
            await completeBooking({
                holder,
                guests,
                payment: { method: "ACC_CREDIT_CARD" },
                paymentIntentId: stripePaymentIntentId,
                propertyName: property?.name || 'Hotel',
                propertyImage: property?.images?.[0] || undefined,
                roomName: selectedRoom?.title || 'Room',
                checkIn: checkIn ? checkIn.toISOString().split('T')[0] : '',
                checkOut: checkOut ? checkOut.toISOString().split('T')[0] : '',
                adults,
                children,
                currency: selectedCurrency,
                specialRequests: specialRequests || undefined,
                voucherCode: appliedVoucher?.code || undefined,
                discountAmount: appliedVoucher?.discountAmount || 0,
            });

            // Show success immediately
            setIsSuccess(true);

            const confirmedBookingId = useBookingStore.getState().bookingId;

            const finalBookingPrice = appliedVoucher
                ? appliedVoucher.finalPrice
                : totalPrice;

            // Fire-and-forget post-booking tasks
            const postBookingTasks: Promise<unknown>[] = [
                sendConfirmationEmail({
                    bookingId: confirmedBookingId || 'N/A',
                    email: formData.email,
                    guestName: `${guests[0].firstName} ${guests[0].lastName}`,
                    hotelName: property?.name || 'Hotel',
                    roomName: selectedRoom?.title || 'Room',
                    checkIn: checkIn?.toLocaleDateString() || '',
                    checkOut: checkOut?.toLocaleDateString() || '',
                    totalPrice: finalBookingPrice,
                    currency: selectedCurrency,
                }),
            ];

            if (user && confirmedBookingId) {
                postBookingTasks.push(
                    apiFetch('/api/booking/save', {
                        bookingId: confirmedBookingId,
                        propertyName: property?.name || 'Hotel',
                        propertyImage: property?.image,
                        roomName: selectedRoom?.title || 'Room',
                        checkIn: checkIn?.toISOString().split('T')[0] || '',
                        checkOut: checkOut?.toISOString().split('T')[0] || '',
                        adults,
                        children,
                        totalPrice: finalBookingPrice,
                        currency: selectedCurrency,
                        holderFirstName: formData.firstName,
                        holderLastName: formData.lastName,
                        holderEmail: formData.email,
                        specialRequests: specialRequests || undefined,
                        cancellationPolicy: priceData?.cancellationPolicies || undefined,
                    }).catch(err => console.error("Failed to save booking:", err))
                );

                if (appliedVoucher) {
                    postBookingTasks.push(
                        apiFetch('/api/voucher/record', {
                            voucherCode: appliedVoucher.code,
                            bookingId: confirmedBookingId,
                            originalPrice: priceData?.total || totalPrice || 0,
                            discountApplied: appliedVoucher.discountAmount,
                            finalPrice: appliedVoucher.finalPrice,
                            currency: selectedCurrency,
                        }).catch(err => console.error("Failed to save voucher usage:", err))
                    );
                }
            }

            Promise.all(postBookingTasks).catch(err =>
                console.error("Post-booking tasks error:", err)
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Booking failed';

            // Session expired AFTER Stripe captured payment — the booking is NOT confirmed.
            // Do NOT claim a refund will happen automatically (auth failed before refund logic runs).
            if (message === 'Authentication required' || message.toLowerCase().includes('authentication')) {
                toast.error(
                    `Your session expired during payment. Your card was charged — please contact support with payment reference: ${stripePaymentIntentId}`,
                    { duration: 15000 }
                );
                openAuthModal('email', window.location.pathname + window.location.search);
            } else if (message.includes("refunded")) {
                toast.error(message);
            } else {
                toast.error(`Booking confirmation failed: ${message}. Your payment will be automatically refunded.`);
            }
            // Return to form so user can retry
            setStep('form');
            setClientSecret(null);
        }
    }, [prebookId, selectedRoom, formData, bookingFor, specialRequests, completeBooking, setIsSuccess, sendConfirmationEmail, property, checkIn, checkOut, priceData, selectedCurrency, adults, children, user, totalPrice, appliedVoucher, openAuthModal]);

    // Price to show on submit button (server-calculated if voucher applied)
    const displayTotalPrice = appliedVoucher ? appliedVoucher.finalPrice : totalPrice;

    // Success screen
    useEffect(() => {
        if (isSuccess && typeof window !== 'undefined') {
            sessionStorage.removeItem('bundleFlightId');
            sessionStorage.setItem('hasAlreadyBookedHotel', 'true');
        }
    }, [isSuccess]);

    if (isSuccess) {
        // savings = 3% of base price; base = bundlePrice / 1.12, so savings = totalPrice * 3/112
        const bundleSavings = bundleFlightId && totalPrice ? Math.round(totalPrice * 3 / 112 * 100) / 100 : undefined;
        return (
            <BookingSuccess
                propertyName={property?.name || "Grand Sierra Pines"}
                bookingId={bookingId}
                checkIn={checkIn}
                checkOut={checkOut}
                email={formData.email}
                emailSent={emailSent}
                bundleFlightId={bundleFlightId}
                bundleSavings={bundleSavings}
                currency={selectedCurrency}
                hotelDestination={property?.city}
            />
        );
    }

    return (
        <>
            <main className="min-h-screen pt-4 lg:pt-6 pb-20 px-3 lg:px-4 md:px-6 relative">
                <div className="max-w-6xl mx-auto">
                    {/* Desktop Text Back Button — hidden on payment step (has its own back button) */}
                    {step !== 'payment' && (
                        <div className="hidden md:flex mb-2 justify-between items-center">
                            <BackButton label="Modify booking" />
                        </div>
                    )}

                    {/* Mobile Floating Back Button */}
                    <div className="md:hidden mt-2 mb-4">
                        <button
                            onClick={() => window.history.back()}
                            className="p-2 border border-slate-200/50 dark:border-slate-700/50 bg-white dark:bg-slate-900 rounded-full shadow-sm inline-flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-slate-300">
                                <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                            </svg>
                        </button>
                    </div>

                    <h1 className="text-[18px] lg:text-3xl font-display font-bold text-slate-900 dark:text-white mb-4 lg:mb-8 text-left">
                        Secure your booking
                    </h1>

                    {/* Auth Required Banner */}
                    {!user && (
                        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 rounded-lg">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <LogIn className="text-amber-600 dark:text-amber-400 shrink-0" size={24} />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">Sign in to complete your booking</h3>
                                    <p className="text-sm text-amber-600 dark:text-amber-400">
                                        You'll receive booking confirmation and updates via email.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        const redirectPath = window.location.pathname + window.location.search;
                                        openAuthModal('email', redirectPath);
                                    }}
                                    className="px-4 py-2 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors w-full sm:w-auto"
                                >
                                    Sign In
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Prebook Error — unavailability is handled inline near the button; show banner only for other errors */}
                    {prebookError && !isAuthModalOpen && !(!user && /auth/i.test(prebookError)) && !/no longer available|not available|unavailable|sold out/i.test(prebookError) && (
                        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-4 rounded-lg">
                            <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Booking error</p>
                            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{prebookError}</p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => window.history.back()}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                >
                                    Go back
                                </button>
                                <button
                                    onClick={retryPrebook}
                                    className="px-4 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
                        {/* Main Content — switches between form and payment */}
                        <div className="lg:col-span-2 space-y-2.5 lg:space-y-6">
                            {step === 'form' ? (
                                <>
                                    {/* Duplicate booking inline banner */}
                                    {duplicateBooking && (
                                        <div className="rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3 lg:p-4 space-y-2.5">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="text-red-500 dark:text-red-400 shrink-0" size={18} />
                                                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                                                    You already have a booking at {property?.name}
                                                    {duplicateBooking.existingCheckIn && duplicateBooking.existingCheckOut && (
                                                        <> ({new Date(duplicateBooking.existingCheckIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(duplicateBooking.existingCheckOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})</>
                                                    )} for overlapping dates.
                                                </p>
                                            </div>
                                            <p className="text-xs text-red-600 dark:text-red-400">Cancel your existing booking first, or go back and keep it.</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => router.push(`/trips?highlight=${duplicateBooking.existingBookingId}`)}
                                                    className="flex-1 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                                >
                                                    View existing booking
                                                </button>
                                                <button
                                                    onClick={() => router.push('/')}
                                                    className="flex-1 py-2 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                >
                                                    Keep existing booking
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <UserDetailsForm
                                        formData={formData}
                                        onInputChange={handleInputChange}
                                        phoneCountryCode={phoneCountryCode}
                                        onPhoneCountryChange={setPhoneCountryCode}
                                        isWorkTravel={isWorkTravel}
                                        onWorkTravelChange={setIsWorkTravel}
                                        errors={formErrors}
                                    />

                                    <BookingForSection
                                        bookingFor={bookingFor}
                                        onBookingForChange={setBookingFor}
                                        formData={formData}
                                        onInputChange={handleInputChange}
                                        errors={formErrors}
                                    />

                                    <SpecialRequestsSection
                                        value={specialRequests}
                                        onChange={setSpecialRequests}
                                    />

                                    {/* Voucher/Promo Section */}
                                    <VoucherInput
                                        bookingPrice={totalPrice}
                                        currency={selectedCurrency}
                                        onVoucherApplied={reprebookWithVoucher}
                                        onVoucherRemoved={reprebookWithoutVoucher}
                                    />

                                    <AvailablePromos
                                        bookingPrice={totalPrice}
                                        currency={selectedCurrency}
                                        onVoucherApplied={reprebookWithVoucher}
                                    />

                                    <div className="hidden lg:block">
                                        <SubmitBookingButton
                                            loading={loading || isCreatingPayment}
                                            prebooking={prebooking}
                                            prebookId={prebookId}
                                            isAuthenticated={!!user}
                                            totalPrice={displayTotalPrice}
                                            prebookError={prebookError}
                                            onSubmit={handleProceedToPayment}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Payment step — Stripe Embedded Checkout */}
                                    <div className="space-y-4">
                                        <button
                                            onClick={() => { setStep('form'); setClientSecret(null); }}
                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                                            Back to booking details
                                        </button>

                                        {clientSecret ? (
                                            <StripeEmbeddedCheckout
                                                clientSecret={clientSecret}
                                                onSuccess={handlePaymentSuccess}
                                            />
                                        ) : (
                                            <div className="p-8 text-center text-slate-500">Loading payment form...</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Sidebar Summary — always visible */}
                        <div className="flex flex-col gap-4 lg:gap-6 lg:sticky lg:top-24 self-start">
                            <BookingSummary
                                propertyName={displayProperty.name}
                                propertyImage={property?.image}
                                propertyAddress={property?.location}
                                starRating={undefined}
                                reviewScore={property?.rating}
                                reviewCount={property?.reviews}
                                roomTitle={displayRoom.title}
                                roomPrice={roomPrice}
                                totalNights={totalNights}
                                adults={adults}
                                children={children}
                                taxes={taxes}
                                totalPrice={totalPrice}
                                checkIn={checkIn}
                                checkOut={checkOut}
                                prebookId={prebookId}
                                cancellationPolicies={priceData?.cancellationPolicies}
                                appliedVoucher={appliedVoucher}
                                isLoading={prebooking}
                            />

                            {/* Mobile-only Submit Button — only on form step */}
                            {step === 'form' && (
                                <div className="block lg:hidden">
                                    <SubmitBookingButton
                                        loading={loading || isCreatingPayment}
                                        prebooking={prebooking}
                                        prebookId={prebookId}
                                        isAuthenticated={!!user}
                                        totalPrice={displayTotalPrice}
                                        prebookError={prebookError}
                                        onSubmit={handleProceedToPayment}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Booking confirmation overlay — covers form after Stripe payment succeeds */}
                {loading && step === 'payment' && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg">
                        <div className="flex flex-col items-center gap-6 px-8 text-center max-w-xs">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-blue-900 border-t-blue-600 animate-spin" />
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Confirming your booking</h2>
                                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium animate-pulse min-h-[20px]">
                                    {BOOKING_STEPS[bookingStepIdx]}
                                </p>
                            </div>
                            <div className="w-full space-y-2">
                                {BOOKING_STEPS.map((label, i) => (
                                    <div key={label} className={`flex items-center gap-2 text-xs ${i <= bookingStepIdx ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}`}>
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${i < bookingStepIdx ? 'bg-green-500 text-white' : i === bookingStepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                            {i < bookingStepIdx ? '✓' : i + 1}
                                        </span>
                                        {label}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-400 dark:text-slate-500">Please don&apos;t close this page</p>
                        </div>
                    </div>
                )}
            </main>
            <AuthModal />
        </>
    );
}
