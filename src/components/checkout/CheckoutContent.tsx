"use client";

import React, { useCallback, useEffect, useState } from 'react';
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
    useCheckoutStore,
} from '@/stores/checkoutStore';
import {
    useBookingFlow,
    useCheckoutForm,
    useCheckoutPrebook,
    usePricingCalculation,
} from '@/hooks';
import { apiFetch } from '@/lib/api/client';
import { LogIn } from 'lucide-react';
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
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';

export function CheckoutContent() {
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
    const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
    const [isCreatingPayment, setIsCreatingPayment] = useState(false);

    // Reset success state from previous booking on mount
    useEffect(() => {
        setIsSuccess(false);
        setEmailSent(false);

        // Sync currency from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const urlCurrency = urlParams.get('currency');
        if (urlCurrency && urlCurrency !== selectedCurrency) {
            useCheckoutStore.getState().setSelectedCurrency(urlCurrency);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Prebook trigger hook (handles mount, currency change, auth retry)
    const { retryPrebook } = useCheckoutPrebook({
        selectedCurrency,
        startPrebook,
        prebookError,
    });

    // Pricing calculation hook
    const { displayProperty, displayRoom, totalNights, taxes, totalPrice } = usePricingCalculation({
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

        // Use server-calculated final price if voucher applied
        const chargeAmount = appliedVoucher
            ? appliedVoucher.finalPrice
            : (priceData?.total || totalPrice || 0);

        if (chargeAmount <= 0) {
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
                }
            );

            if (!result.success) {
                throw new Error('error' in result ? result.error : 'Failed to create payment session');
            }

            if (!result.data?.clientSecret) {
                throw new Error('Failed to create payment session');
            }

            setClientSecret(result.data.clientSecret);
            setPaymentIntentId(result.data.paymentIntentId);
            setStep('payment');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Payment setup failed';
            toast.error(message);
        } finally {
            setIsCreatingPayment(false);
        }
    }, [user, prebookId, selectedRoom, formData, bookingFor, priceData, selectedCurrency, property, openAuthModal, totalPrice, clearFormErrors, setFormErrors, appliedVoucher]);

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
            } as any);

            // Show success immediately
            setIsSuccess(true);

            const confirmedBookingId = useBookingStore.getState().bookingId;

            const finalBookingPrice = appliedVoucher
                ? appliedVoucher.finalPrice
                : (priceData?.total || totalPrice || 0);

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
            if (message.includes("refunded")) {
                toast.error(message);
            } else {
                toast.error(`Booking confirmation failed: ${message}. Your payment will be automatically refunded.`);
            }
            // Return to form so user can retry
            setStep('form');
            setClientSecret(null);
            setPaymentIntentId(null);
        }
    }, [prebookId, selectedRoom, formData, bookingFor, specialRequests, completeBooking, setIsSuccess, sendConfirmationEmail, property, checkIn, checkOut, priceData, selectedCurrency, adults, children, user, totalPrice, appliedVoucher]);

    // Price to show on submit button (server-calculated if voucher applied)
    const displayTotalPrice = appliedVoucher ? appliedVoucher.finalPrice : totalPrice;

    // Success screen
    if (isSuccess) {
        return (
            <BookingSuccess
                propertyName={property?.name || "Grand Sierra Pines"}
                bookingId={bookingId}
                checkIn={checkIn}
                checkOut={checkOut}
                email={formData.email}
                emailSent={emailSent}
            />
        );
    }

    return (
        <>
            <main className="min-h-screen pt-4 lg:pt-6 pb-20 px-3 lg:px-4 md:px-6 relative">
                <div className="max-w-6xl mx-auto">
                    {/* Desktop Text Back Button */}
                    <div className="hidden md:flex mb-2 justify-between items-center">
                        <BackButton label="Modify booking" />
                    </div>

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
                                <LogIn className="text-amber-600 dark:text-amber-400 flex-shrink-0" size={24} />
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

                    {/* Prebook Error */}
                    {prebookError && !isAuthModalOpen && (
                        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-4 rounded-lg text-red-600 dark:text-red-400">
                            <strong>Error:</strong> {prebookError}
                            <button
                                onClick={retryPrebook}
                                className="ml-4 px-3 py-1 bg-red-500 text-white rounded text-sm"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
                        {/* Main Content — switches between form and payment */}
                        <div className="lg:col-span-2 space-y-2.5 lg:space-y-6">
                            {step === 'form' ? (
                                <>
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
                                roomPrice={displayRoom.price}
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
            </main>
            <AuthModal />
        </>
    );
}
