"use client";

import React, { useCallback, useEffect } from 'react';
import {
    useProperty,
    useSelectedRoom,
    useBookingDates,
    useGuestCount,
    useBookingId,
    useBookingStore,
} from '@/stores/bookingStore';
import { useAuthStore, useUser } from '@/stores/authStore';
import { useVoucherState } from '@/stores/checkoutStore';
import {
    useBookingFlow,
    useCheckoutForm,
    useCheckoutPrebook,
    usePricingCalculation,
} from '@/hooks';
import { saveBookingToDatabase, sendBookingConfirmationEmail, saveVoucherUsage } from '@/app/actions';
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
    PaymentForm,
    BookingSummary,
    SubmitBookingButton,
    VoucherInput,
    AvailablePromos,
} from '@/components/checkout';

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
        payeeFirstName,
        setPayeeFirstName,
        payeeLastName,
        setPayeeLastName,
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

    // Reset success state from previous booking on mount
    useEffect(() => {
        setIsSuccess(false);
        setEmailSent(false);
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

    // Send confirmation email via server action
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
            const result = await sendBookingConfirmationEmail(bookingDetails);
            if (result.success) setEmailSent(true);
        } catch (err) {
            console.error("Failed to send confirmation email:", err);
        }
    }, [setEmailSent]);

    // Complete booking handler
    const handleCompleteBooking = useCallback(async () => {
        if (!user) {
            openAuthModal('email');
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

        try {
            if (!prebookId || !selectedRoom?.offerId) {
                throw new Error("Booking session expired. Please go back and select the room again.");
            }

            const guests = buildGuestPayload(formData, bookingFor, specialRequests);
            const holder = buildHolderPayload(formData);

            // Use direct card payment method
            const payment = { method: "ACC_CREDIT_CARD" };

            await completeBooking({
                holder,
                guests,
                payment,
            });

            // Show success immediately - don't wait for email/save
            setIsSuccess(true);

            const confirmedBookingId = useBookingStore.getState().bookingId;

            // Use server-calculated final price if voucher applied
            const finalBookingPrice = appliedVoucher
                ? appliedVoucher.finalPrice
                : (priceData?.total || totalPrice || 0);

            // Run email and save in parallel for faster completion
            // These are fire-and-forget - user sees success immediately
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
                    saveBookingToDatabase({
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

                // Record voucher usage if promo was applied
                if (appliedVoucher) {
                    postBookingTasks.push(
                        saveVoucherUsage({
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

            // Execute in parallel without blocking
            Promise.all(postBookingTasks).catch(err =>
                console.error("Post-booking tasks error:", err)
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Booking failed';
            if (message.includes("fraud check") || message.includes("2013")) {
                toast.error("Booking rejected by fraud prevention. Please use realistic information.");
            } else {
                toast.error(`Booking failed: ${message}`);
            }
        }
    }, [user, prebookId, selectedRoom, formData, bookingFor, specialRequests, completeBooking, setIsSuccess, sendConfirmationEmail, property, checkIn, checkOut, priceData, selectedCurrency, adults, children, openAuthModal, totalPrice, clearFormErrors, setFormErrors, appliedVoucher]);

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
            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-2 flex justify-between items-center">
                        <BackButton label="Modify booking" />
                    </div>

                    <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-8">
                        Secure your booking
                    </h1>

                    {/* Auth Required Banner */}
                    {!user && (
                        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 rounded-lg">
                            <div className="flex items-center gap-3">
                                <LogIn className="text-amber-600 dark:text-amber-400" size={24} />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">Sign in to complete your booking</h3>
                                    <p className="text-sm text-amber-600 dark:text-amber-400">
                                        You'll receive booking confirmation and updates via email.
                                    </p>
                                </div>
                                <button
                                    onClick={() => openAuthModal('email')}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
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

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Form */}
                        <div className="lg:col-span-2 space-y-6">
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

                            {/* Available Promos (server-fetched) */}
                            <AvailablePromos
                                bookingPrice={totalPrice}
                                currency={selectedCurrency}
                                onVoucherApplied={reprebookWithVoucher}
                            />

                            {/* Payment — Direct Card Form */}
                            <PaymentForm
                                formData={formData}
                                onInputChange={handleInputChange}
                                payeeFirstName={payeeFirstName}
                                payeeLastName={payeeLastName}
                                onPayeeFirstNameChange={setPayeeFirstName}
                                onPayeeLastNameChange={setPayeeLastName}
                                errors={formErrors}
                            />

                            <SubmitBookingButton
                                loading={loading}
                                prebooking={prebooking}
                                prebookId={prebookId}
                                isAuthenticated={!!user}
                                totalPrice={displayTotalPrice}
                                prebookError={prebookError}
                                onSubmit={handleCompleteBooking}
                            />
                        </div>

                        {/* Sidebar Summary */}
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
                    </div>
                </div>
            </main>
            <AuthModal />
        </>
    );
}
