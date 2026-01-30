"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    useProperty,
    useSelectedRoom,
    useBookingDates,
    useGuestCount,
    useBookingId,
} from '@/stores/bookingStore';
import { useAuthStore, useUser } from '@/stores/authStore';
import { useBookingFlow } from '@/hooks';
import { Header, Footer } from '@/components/landing';
import { Lock, CreditCard, ShieldCheck, CheckCircle, User as UserIcon, Loader2, LogIn, Mail, PartyPopper, Calendar, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import BackButton from '@/components/common/BackButton';
import AuthModal from '@/components/auth/AuthModal';
import { Confetti, Balloons } from '@/components/ui/Animations';

export default function CheckoutPage() {
    const router = useRouter();
    // Use granular selectors (Phase 2) - prevents unnecessary re-renders
    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();
    const { adults, children } = useGuestCount();
    const bookingId = useBookingId();

    // Auth state
    const user = useUser();
    const { openAuthModal, isAuthModalOpen } = useAuthStore();

    // Use React Query booking flow (Phase 3)
    const {
        prebookId,
        priceData,
        isPrebooking: prebooking,
        isBooking: loading,
        prebookError: prebookErrorObj,
        startPrebook,
        completeBooking,
    } = useBookingFlow();

    const [isSuccess, setIsSuccess] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const prebookError = prebookErrorObj?.message || null;

    const [selectedCurrency, setSelectedCurrency] = useState('PHP');
    const [phoneCountryCode, setPhoneCountryCode] = useState('+63');

    // Form State
    // Enhanced State for LiteAPI Reference UI
    const [bookingFor, setBookingFor] = useState<'myself' | 'someone_else'>('myself');
    const [isWorkTravel, setIsWorkTravel] = useState(false);
    const [specialRequests, setSpecialRequests] = useState('');

    // Payee specific state (distinct from booker)
    const [payeeFirstName, setPayeeFirstName] = useState('');
    const [payeeLastName, setPayeeLastName] = useState('');

    // Pre-fill form with user data if logged in
    const [formData, setFormData] = useState({
        firstName: '', // Booker First Name
        lastName: '',  // Booker Last Name
        phone: '',
        email: '',

        // Guest Details (if different from booker)
        guestFirstName: '',
        guestLastName: '',

        cardNumber: '',
        expiry: '',
        cvc: '',
        cardCountry: 'PH',
        cardAddress: '',
        cardCity: '',
        cardZip: ''
    });

    // Auto-fill form when user logs in
    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                firstName: prev.firstName || user.firstName || '',
                lastName: prev.lastName || user.lastName || '',
                email: prev.email || user.email || '',
            }));
        }
    }, [user]);

    // Auto-retry prebook after successful authentication if there was an error
    useEffect(() => {
        // Only retry if: user just logged in, there was a prebook error, and we have an offer
        if (user && prebookError && selectedRoom?.offerId && !isAuthModalOpen) {
            console.log("[Checkout] User authenticated, retrying prebook after error...");
            prebookInitiatedRef.current = null; // Reset to allow retry
            startPrebook(selectedRoom.offerId, selectedCurrency)
                .then((result) => {
                    console.log("[Checkout] Prebook retry success:", result.prebookId);
                })
                .catch((err) => {
                    console.error("[Checkout] Prebook retry failed:", err);
                });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isAuthModalOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });

        // Auto-switch currency based on billing country
        if (name === 'cardCountry') {
            const currencyMap: Record<string, string> = {
                'PH': 'PHP', 'SG': 'SGD', 'MY': 'MYR', 'ID': 'IDR',
                'TH': 'THB', 'VN': 'VND', 'KR': 'KRW', 'JP': 'JPY', 'US': 'USD'
            };
            if (currencyMap[value]) setSelectedCurrency(currencyMap[value]);
        }
    };

    // Redirect if no booking data
    useEffect(() => {
        if (!property || !selectedRoom) {
            // router.push('/');
        }
    }, [property, selectedRoom, router]);

    // 1. PRE-BOOK on Mount or Currency Change (Phase 3 - React Query)
    // Track if prebook was already initiated for this offer/currency combo
    const prebookInitiatedRef = React.useRef<string | null>(null);

    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;

        // Only call prebook if we haven't already for this offer/currency
        if (selectedRoom?.offerId && prebookInitiatedRef.current !== prebookKey) {
            prebookInitiatedRef.current = prebookKey;
            console.log("Starting Prebook for offer:", selectedRoom.offerId, "Currency:", selectedCurrency);
            startPrebook(selectedRoom.offerId, selectedCurrency)
                .then((result) => {
                    console.log("Prebook Success:", result.prebookId);
                })
                .catch((err) => {
                    console.error("Prebook Error:", err);
                    // Reset ref on error so user can retry
                    prebookInitiatedRef.current = null;
                });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRoom?.offerId, selectedCurrency]);

    // Send booking confirmation email
    const sendConfirmationEmail = async (bookingDetails: {
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
            if (response.ok) {
                setEmailSent(true);
                console.log("Confirmation email sent successfully");
            }
        } catch (err) {
            console.error("Failed to send confirmation email:", err);
            // Don't fail the booking if email fails
        }
    };

    // 2. COMPLETE BOOKING (Phase 3 - React Query with automatic retry)
    const handleCompleteBooking = async () => {
        // Check if user is logged in
        if (!user) {
            openAuthModal('email');
            return;
        }

        try {
            if (!prebookId || !selectedRoom?.offerId) {
                throw new Error("Booking session expired. Please go back and select the room again.");
            }

            // Construct guest details
            const primaryGuest: any = {
                occupancyNumber: 1,
                firstName: bookingFor === 'myself' ? formData.firstName : formData.guestFirstName,
                lastName: bookingFor === 'myself' ? formData.lastName : formData.guestLastName,
                email: formData.email
            };

            // Only add remarks if user provided special requests
            if (specialRequests && specialRequests.trim()) {
                primaryGuest.remarks = specialRequests.trim();
            }

            console.log("Starting booking with React Query...");

            // Use completeBooking from useBookingFlow (handles retry automatically)
            await completeBooking({
                holder: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email
                },
                guests: [primaryGuest],
                payment: {
                    method: "ACC_CREDIT_CARD"
                }
            });

            // Success - booking completed
            setIsSuccess(true);
            console.log("Booking completed successfully!");

            // Send confirmation email (bookingId comes from store after mutation)
            await sendConfirmationEmail({
                bookingId: bookingId || 'N/A',
                email: formData.email,
                guestName: `${primaryGuest.firstName} ${primaryGuest.lastName}`,
                hotelName: property?.name || 'Hotel',
                roomName: selectedRoom?.title || 'Room',
                checkIn: checkIn?.toLocaleDateString() || '',
                checkOut: checkOut?.toLocaleDateString() || '',
                totalPrice: priceData?.total || totalPrice || 0,
                currency: selectedCurrency,
            });

        } catch (err: any) {
            console.error("Booking Error:", err);

            // Check for fraud check rejection
            if (err.message?.includes("fraud check") || err.message?.includes("2013")) {
                alert("Booking rejected by fraud prevention system.\n\nPlease use realistic information:\n• Real-looking names (e.g., 'John Smith')\n• Valid email addresses (not @mailinator.com)\n• Realistic phone numbers");
            } else {
                alert(`Booking Failed: ${err.message}\n\nPlease go back and select your room again.`);
            }
        }
    };

    if (isSuccess) {
        return (
            <>
                <Header />
                <main className="min-h-screen pt-6 pb-20 px-4 flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950">
                    {/* Celebration Effects */}
                    <Confetti count={80} />
                    <Balloons count={12} />

                    {/* Animated background circles */}
                    <motion.div
                        className="absolute top-20 left-10 w-72 h-72 bg-green-300/20 dark:bg-green-500/10 rounded-full blur-3xl"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 4, repeat: Infinity }}
                    />
                    <motion.div
                        className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300/20 dark:bg-blue-500/10 rounded-full blur-3xl"
                        animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 5, repeat: Infinity }}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
                        className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                    >
                        {/* Success Icon with Animation */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                            className="relative mx-auto mb-6"
                        >
                            <motion.div
                                className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
                                animate={{ boxShadow: ['0 10px 30px rgba(34, 197, 94, 0.3)', '0 10px 50px rgba(34, 197, 94, 0.5)', '0 10px 30px rgba(34, 197, 94, 0.3)'] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <CheckCircle size={40} className="text-white" strokeWidth={2.5} />
                            </motion.div>
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.4, type: 'spring' }}
                                className="absolute -top-1 -right-1 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md"
                            >
                                <PartyPopper size={16} className="text-yellow-800" />
                            </motion.div>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-2xl font-bold text-slate-900 dark:text-white mb-2"
                        >
                            Booking Confirmed! 🎉
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-slate-500 dark:text-slate-400 mb-6"
                        >
                            Your reservation at <span className="font-semibold text-emerald-600 dark:text-emerald-400">{property?.name || "Grand Sierra Pines"}</span> is complete.
                        </motion.p>

                        {/* Booking Details Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-5 rounded-2xl mb-6 text-left border border-slate-200/50 dark:border-white/5"
                        >
                            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-white/10">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                    <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Booking ID</p>
                                    <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">{bookingId}</p>
                                </div>
                            </div>

                            {checkIn && checkOut && (
                                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-white/10">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                        <Calendar size={18} className="text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Stay Duration</p>
                                        <p className="font-medium text-slate-900 dark:text-white text-sm">
                                            {checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {checkOut.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                    <Mail size={18} className="text-green-600 dark:text-green-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Confirmation sent to</p>
                                    <p className="font-medium text-slate-900 dark:text-white text-sm">{formData.email}</p>
                                </div>
                                {emailSent && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full"
                                    >
                                        <CheckCircle size={12} />
                                        Sent
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="space-y-3"
                        >
                            <button
                                onClick={() => router.push('/')}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all active:scale-[0.98]"
                            >
                                Return to Home
                            </button>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Check your email for booking details and updates
                            </p>
                        </motion.div>
                    </motion.div>
                </main>
                <Footer />
            </>
        );
    }

    // Mock data if missing/refresh
    const displayProperty = property || { name: "Grand Sierra Pines Baguio", rating: 4.8, image: "https://via.placeholder.com/150" };
    const displayRoom = selectedRoom || { title: "Deluxe King Room", price: 5200 };
    const totalNights = (checkIn && checkOut) ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) : 2;

    // Calculate totals - PREFER PRICE DATA FROM API IF AVAILABLE
    // If priceData exists (from prebook), use it. Else calculate locally (legacy).
    const baseRoomPrice = displayRoom.price || 5200;
    const roomPrice = priceData?.price ?? (baseRoomPrice * totalNights);
    const taxes = priceData?.tax ?? (roomPrice * 0.12);
    const totalPrice = priceData?.total ?? (roomPrice + taxes);

    return (
        <>
            <Header />
            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-2 flex justify-between items-center">
                        <BackButton label="Modify booking" />

                        {/* Currency Selector */}
                        {/* Currency Selector Removed - Auto-linked to Country */}
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

                    {/* Only show prebook error when auth modal is NOT open - prevents confusing UX during sign-in */}
                    {prebookError && !isAuthModalOpen && (
                        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-4 rounded-lg text-red-600 dark:text-red-400">
                            <strong>Error:</strong> {prebookError}
                            <button
                                onClick={() => {
                                    prebookInitiatedRef.current = null;
                                    if (selectedRoom?.offerId) {
                                        startPrebook(selectedRoom.offerId, selectedCurrency);
                                    }
                                }}
                                className="ml-4 px-3 py-1 bg-red-500 text-white rounded text-sm"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Form */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* User Details */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <UserIcon size={20} className="text-blue-600" />
                                    Your details
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">First Name *</label>
                                        <input name="firstName" value={formData.firstName} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Enter first name" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Last Name *</label>
                                        <input name="lastName" value={formData.lastName} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Enter last name" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email *</label>
                                        <input name="email" value={formData.email} onChange={handleInputChange} type="email" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Enter email" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Phone</label>
                                        <div className="flex gap-2">
                                            <select
                                                value={phoneCountryCode}
                                                onChange={(e) => setPhoneCountryCode(e.target.value)}
                                                className="w-32 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-sm"
                                            >
                                                <option value="+63">PH (+63)</option>
                                                <option value="+65">SG (+65)</option>
                                                <option value="+60">MY (+60)</option>
                                                <option value="+62">ID (+62)</option>
                                                <option value="+66">TH (+66)</option>
                                                <option value="+84">VN (+84)</option>
                                                <option value="+82">KR (+82)</option>
                                                <option value="+81">JPY (+81)</option>
                                                <option value="+1">US (+1)</option>
                                            </select>
                                            <input name="phone" value={formData.phone} onChange={handleInputChange} type="tel" className="flex-1 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Phone number" />
                                        </div>
                                    </div>

                                    {/* Work Travel */}
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Are you traveling for work?</label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" checked={isWorkTravel} onChange={() => setIsWorkTravel(true)} className="w-4 h-4 text-blue-600" />
                                                <span className="text-sm">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" checked={!isWorkTravel} onChange={() => setIsWorkTravel(false)} className="w-4 h-4 text-blue-600" />
                                                <span className="text-sm">No</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Booking For */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Who is the booking for?</h2>
                                <div className="flex gap-4 mb-4">
                                    <button
                                        className={`flex-1 py-2 rounded-lg border ${bookingFor === 'myself' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                                        onClick={() => setBookingFor('myself')}
                                    >
                                        Myself
                                    </button>
                                    <button
                                        className={`flex-1 py-2 rounded-lg border ${bookingFor === 'someone_else' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                                        onClick={() => setBookingFor('someone_else')}
                                    >
                                        Someone else
                                    </button>
                                </div>
                                {bookingFor === 'someone_else' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest First Name</label>
                                            <input name="guestFirstName" value={formData.guestFirstName} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest Last Name</label>
                                            <input name="guestLastName" value={formData.guestLastName} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Special Requests */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Any special requests?</h2>
                                <textarea
                                    value={specialRequests}
                                    onChange={(e) => setSpecialRequests(e.target.value)}
                                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 h-24"
                                    placeholder="The property will do its best to arrange it."
                                ></textarea>
                            </div>

                            {/* Payment */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-blue-600" />
                                    Payment Information
                                </h2>
                                <div className="flex gap-4 mb-6">
                                    <button className="flex-1 py-3 border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold rounded-lg flex items-center justify-center gap-2">
                                        <CreditCard size={18} /> Card
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input name="cardNumber" value={formData.cardNumber} onChange={handleInputChange} type="text" className="w-full p-3 pl-10 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Card number" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input name="expiry" value={formData.expiry} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="MM / YY" />
                                        <input name="cvc" value={formData.cvc} onChange={handleInputChange} type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Security code" />
                                    </div>

                                    {/* Country Dropdown first (per image) */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Country</label>
                                        <select
                                            name="cardCountry"
                                            value={formData.cardCountry || "PH"}
                                            onChange={handleInputChange}
                                            className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                                        >
                                            <option value="PH">Philippines</option>
                                            <option value="SG">Singapore</option>
                                            <option value="MY">Malaysia</option>
                                            <option value="ID">Indonesia</option>
                                            <option value="TH">Thailand</option>
                                            <option value="VN">Vietnam</option>
                                            <option value="KR">South Korea</option>
                                            <option value="JP">Japan</option>
                                            <option value="US">United States</option>
                                        </select>
                                    </div>

                                    {/* Payee Names (New State) */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Payee First Name</label>
                                            <input
                                                value={payeeFirstName}
                                                onChange={(e) => setPayeeFirstName(e.target.value)}
                                                type="text"
                                                className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Payee Last Name</label>
                                            <input
                                                value={payeeLastName}
                                                onChange={(e) => setPayeeLastName(e.target.value)}
                                                type="text"
                                                className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Billing Address Removed per User Request (Not in LiteAPI Screenshot) */}
                                </div>

                                <div className="mt-6 flex items-start gap-3">
                                    <ShieldCheck className="text-green-600 shrink-0 mt-0.5" size={18} />
                                    <p className="text-xs text-slate-500">
                                        Your payment information is secured.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleCompleteBooking}
                                disabled={loading || (prebooking && !prebookId) || !!prebookError}
                                className={`w-full py-4 font-bold text-lg rounded-xl shadow-lg transition-all flex items-center justify-center gap-3
                                    ${loading ? 'bg-blue-500 text-white cursor-wait animate-pulse' :
                                      (prebooking && !prebookId) ? 'bg-slate-300 text-slate-900 cursor-not-allowed' :
                                      !user ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20' :
                                      'bg-yellow-400 hover:bg-yellow-500 text-slate-900 shadow-yellow-400/20'}
                                `}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Processing Your Booking...</span>
                                    </>
                                ) : (prebooking && !prebookId) ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Verifying Room Availability...</span>
                                    </>
                                ) : !user ? (
                                    <>
                                        <LogIn className="w-5 h-5" />
                                        <span>Sign In to Complete Booking</span>
                                    </>
                                ) : (
                                    `Complete Booking • ₱${(totalPrice || 0).toLocaleString()}`
                                )}
                            </button>

                            {/* Loading overlay message */}
                            {loading && (
                                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-center">
                                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                                        Please wait while we confirm your reservation with the hotel...
                                    </p>
                                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                                        This may take up to 30 seconds. Do not close this page.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Sidebar Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-lg sticky top-24">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Booking Summary</h3>

                                <div className="mb-6">
                                    <div className="font-bold text-slate-900 dark:text-white">{displayProperty.name}</div>
                                    <div className="text-sm text-slate-500">{displayRoom.title}</div>
                                </div>

                                <div className="space-y-4 border-t border-slate-100 dark:border-white/5 pt-4 mb-6">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Guests</span>
                                        <span className="font-medium text-slate-900 dark:text-white">{adults} Adults, {children} Children</span>
                                    </div>
                                    {prebookId && (
                                        <div className="flex justify-between text-sm items-center">
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded">Room Confirmed</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2 border-t border-slate-100 dark:border-white/5 pt-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">{totalNights} nights x ₱{displayRoom.price.toLocaleString()}</span>
                                        <span className="font-medium text-slate-900 dark:text-white">₱{(displayRoom.price * totalNights).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Taxes & fees</span>
                                        <span className="font-medium text-slate-900 dark:text-white">₱{taxes.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                                        <span className="text-slate-900 dark:text-white">Total</span>
                                        <span className="text-slate-900 dark:text-white">₱{(totalPrice || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />

            {/* Auth Modal */}
            <AuthModal />
        </>
    );
}


