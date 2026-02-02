"use client";

import React, { useCallback } from 'react';
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
    useBookingFlow,
    useCheckoutForm,
    useCheckoutPrebook,
    usePricingCalculation,
} from '@/hooks';
import { Header, Footer } from '@/components/landing';
import { bookingService } from '@/services/booking.service';
import { LogIn } from 'lucide-react';
import BackButton from '@/components/common/BackButton';
import AuthModal from '@/components/auth/AuthModal';
import {
    BookingSuccess,
    UserDetailsForm,
    BookingForSection,
    SpecialRequestsSection,
    PaymentForm,
    BookingSummary,
    SubmitBookingButton,
} from '@/components/checkout';

export default function CheckoutPage() {
    // Booking store selectors
    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();
    const { adults, children } = useGuestCount();
    const bookingId = useBookingId();

    // Auth state
    const user = useUser();
    const { openAuthModal, isAuthModalOpen } = useAuthStore();

    // Booking flow hook
    const {
        prebookId,
        priceData,
        isPrebooking: prebooking,
        isBooking: loading,
        prebookError: prebookErrorObj,
        startPrebook,
        completeBooking,
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
    } = useCheckoutForm();

    const prebookError = prebookErrorObj?.message || null;

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

    // Send confirmation email
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
            const response = await fetch('/api/send-booking-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingDetails),
            });
            if (response.ok) setEmailSent(true);
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

        try {
            if (!prebookId || !selectedRoom?.offerId) {
                throw new Error("Booking session expired. Please go back and select the room again.");
            }

            const primaryGuest: any = {
                occupancyNumber: 1,
                firstName: bookingFor === 'myself' ? formData.firstName : formData.guestFirstName,
                lastName: bookingFor === 'myself' ? formData.lastName : formData.guestLastName,
                email: formData.email
            };

            if (specialRequests?.trim()) {
                primaryGuest.remarks = specialRequests.trim();
            }

            await completeBooking({
                holder: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email
                },
                guests: [primaryGuest],
                payment: { method: "ACC_CREDIT_CARD" }
            });

            setIsSuccess(true);

            const confirmedBookingId = useBookingStore.getState().bookingId;

            await sendConfirmationEmail({
                bookingId: confirmedBookingId || 'N/A',
                email: formData.email,
                guestName: `${primaryGuest.firstName} ${primaryGuest.lastName}`,
                hotelName: property?.name || 'Hotel',
                roomName: selectedRoom?.title || 'Room',
                checkIn: checkIn?.toLocaleDateString() || '',
                checkOut: checkOut?.toLocaleDateString() || '',
                totalPrice: priceData?.total || totalPrice || 0,
                currency: selectedCurrency,
            });

            if (user && confirmedBookingId) {
                try {
                    await bookingService.saveBooking({
                        bookingId: confirmedBookingId,
                        userId: user.id,
                        propertyName: property?.name || 'Hotel',
                        propertyImage: property?.image,
                        roomName: selectedRoom?.title || 'Room',
                        checkIn: checkIn?.toISOString().split('T')[0] || '',
                        checkOut: checkOut?.toISOString().split('T')[0] || '',
                        adults,
                        children,
                        totalPrice: priceData?.total || totalPrice || 0,
                        currency: selectedCurrency,
                        holderFirstName: formData.firstName,
                        holderLastName: formData.lastName,
                        holderEmail: formData.email,
                        specialRequests: specialRequests || undefined,
                    });
                } catch (saveError) {
                    console.error("Failed to save booking:", saveError);
                }
            }
        } catch (err: any) {
            if (err.message?.includes("fraud check") || err.message?.includes("2013")) {
                alert("Booking rejected by fraud prevention system.\n\nPlease use realistic information.");
            } else {
                alert(`Booking Failed: ${err.message}`);
            }
        }
    }, [user, prebookId, selectedRoom, formData, bookingFor, specialRequests, completeBooking, setIsSuccess, sendConfirmationEmail, property, checkIn, checkOut, priceData, selectedCurrency, adults, children, openAuthModal, totalPrice]);

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
            <Header />
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
                            />

                            <BookingForSection
                                bookingFor={bookingFor}
                                onBookingForChange={setBookingFor}
                                formData={formData}
                                onInputChange={handleInputChange}
                            />

                            <SpecialRequestsSection
                                value={specialRequests}
                                onChange={setSpecialRequests}
                            />

                            <PaymentForm
                                formData={formData}
                                onInputChange={handleInputChange}
                                payeeFirstName={payeeFirstName}
                                payeeLastName={payeeLastName}
                                onPayeeFirstNameChange={setPayeeFirstName}
                                onPayeeLastNameChange={setPayeeLastName}
                            />

                            <SubmitBookingButton
                                loading={loading}
                                prebooking={prebooking}
                                prebookId={prebookId}
                                isAuthenticated={!!user}
                                totalPrice={totalPrice}
                                prebookError={prebookError}
                                onSubmit={handleCompleteBooking}
                            />
                        </div>

                        {/* Sidebar Summary */}
                        <BookingSummary
                            propertyName={displayProperty.name}
                            roomTitle={displayRoom.title}
                            roomPrice={displayRoom.price}
                            totalNights={totalNights}
                            adults={adults}
                            children={children}
                            taxes={taxes}
                            totalPrice={totalPrice}
                            prebookId={prebookId}
                        />
                    </div>
                </div>
            </main>
            <Footer />
            <AuthModal />
        </>
    );
}
