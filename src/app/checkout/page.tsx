"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/stores/bookingStore';
import { Header, Footer } from '@/components/landing';
import { ChevronLeft, Lock, CreditCard, ShieldCheck, CheckCircle, User as UserIcon } from 'lucide-react';
import BackButton from '@/components/common/BackButton';
import { invokeEdgeFunction } from '@/utils/supabase/client-functions';

export default function CheckoutPage() {
    const router = useRouter();
    const { property, selectedRoom, checkIn, checkOut, adults, children, prebookId, setBookingDetails } = useBookingStore();
    const [isSuccess, setIsSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [prebooking, setPrebooking] = useState(false);
    const [prebookError, setPrebookError] = useState<string | null>(null);
    const [priceData, setPriceData] = useState<{ price: number, tax: number, total: number } | null>(null);

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

    const [formData, setFormData] = useState({
        firstName: '', // Booker First Name
        lastName: '',  // Booker Last Name
        phone: '',
        email: 'test@example.com',

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

    // 1. PRE-BOOK on Mount or Currency Change
    useEffect(() => {
        const runPrebook = async () => {
            if (selectedRoom?.offerId) {
                setPrebooking(true);
                try {
                    console.log("Starting Prebook for offer:", selectedRoom.offerId, "Currency:", selectedCurrency);
                    const result = await invokeEdgeFunction('liteapi-prebook-v2', {
                        offerId: selectedRoom.offerId,
                        currency: selectedCurrency
                    });

                    if (result && result.data && result.data.prebookId) {
                        console.log("Prebook Success:", result.data.prebookId);

                        // Store prebookId
                        setBookingDetails({
                            prebookId: result.data.prebookId
                        });

                        // Update price if available in prebook
                        if (result.data.price && result.data.price.total) {
                            setPriceData({
                                price: result.data.price.subtotal || result.data.price.total, // fallback
                                tax: result.data.price.taxes || 0,
                                total: result.data.price.total
                            });
                        }
                    }
                } catch (err: any) {
                    console.error("Prebook Error:", err);
                    setPrebookError("Could not verify room availability. Please try again.");
                } finally {
                    setPrebooking(false);
                }
            }
        };

        runPrebook();
    }, [selectedRoom, setBookingDetails, selectedCurrency]);

    const handleCompleteBooking = async () => {
        setLoading(true);
        try {
            // Check if prebookId exists, attempt to refresh if missing or expired
            let currentPrebookId = prebookId;

            if (!currentPrebookId || !selectedRoom?.offerId) {
                throw new Error("Booking session expired. Please go back and select the room again.");
            }

            // Combine Country Code + Phone (Strict E.164)
            // Remove spaces/dashes from user input first
            let cleanPhoneInput = formData.phone.replace(/[\s-]/g, '');
            // Strip leading 0 if present (e.g. 0912 -> 912)
            if (cleanPhoneInput.startsWith('0')) {
                cleanPhoneInput = cleanPhoneInput.substring(1);
            }
            // Combine: e.g. "+63" + "912..." -> "+63912..."
            let formattedPhone = phoneCountryCode + cleanPhoneInput;


            // Format Expiry: Ensure simple MM/YY (strip spaces)
            let cleanExpiry = formData.expiry.replace(/\s/g, '');
            // User likely enters MM/YY, so we just ensure no spaces. 
            // If they entered MM/YYYY, we might need to truncate, but let's stick to standard MM/YY.
            if (cleanExpiry.length > 5) {
                // truncate 12/2030 -> 12/30
                const [mm, yyyy] = cleanExpiry.split('/');
                if (yyyy && yyyy.length === 4) {
                    cleanExpiry = `${mm}/${yyyy.substring(2)}`;
                }
            }

            // Construct Payload - Simplified to match LiteAPI v3.0 documentation
            // Reference: https://docs.liteapi.travel/reference/post_rates-book
            const primaryGuest: any = {
                occupancyNumber: 1, // Required to map guest to room
                firstName: bookingFor === 'myself' ? formData.firstName : formData.guestFirstName,
                lastName: bookingFor === 'myself' ? formData.lastName : formData.guestLastName,
                email: formData.email
            };

            // Only add remarks if user provided special requests
            if (specialRequests && specialRequests.trim()) {
                primaryGuest.remarks = specialRequests.trim();
            }

            // Use ACC_CREDIT_CARD for sandbox testing
            // Each sandbox key is attached to a hidden testing ACC_CREDIT_CARD
            const payload = {
                prebookId: currentPrebookId,
                holder: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email
                },
                guests: [primaryGuest],
                payment: {
                    method: "ACC_CREDIT_CARD"
                }
            };

            console.log("Sending Booking Payload:", payload);

            let result;
            try {
                result = await invokeEdgeFunction('liteapi-book-v2', payload);
                console.log("Booking Result:", result);
            } catch (bookingError: any) {
                // Check for fraud check rejection (error code 2013)
                if (bookingError.message?.includes("fraud check") || bookingError.message?.includes("2013")) {
                    throw new Error("Booking rejected by fraud prevention system.\n\nPlease use realistic information:\n• Real-looking names (e.g., 'John Smith')\n• Valid email addresses (not @mailinator.com)\n• Realistic phone numbers\n\nAuto-generated fake data triggers fraud detection.");
                }

                // Check if error is due to expired prebook session
                if (bookingError.message?.includes("expired") || bookingError.message?.includes("booking failed")) {
                    console.log("Prebook session expired, attempting to refresh...");

                    // Attempt to refresh prebook
                    try {
                        setPrebooking(true);
                        const refreshResult = await invokeEdgeFunction('liteapi-prebook-v2', {
                            offerId: selectedRoom?.offerId,
                            currency: selectedCurrency
                        });

                        if (refreshResult?.data?.prebookId) {
                            currentPrebookId = refreshResult.data.prebookId;
                            setBookingDetails({ prebookId: currentPrebookId });

                            console.log("Prebook refreshed with new ID:", currentPrebookId);

                            // Create new payload with updated prebookId using ACC_CREDIT_CARD
                            const updatedPayload = {
                                ...payload,
                                prebookId: currentPrebookId,
                                payment: {
                                    method: "ACC_CREDIT_CARD"
                                }
                            };

                            console.log("Retrying booking with updated payload:", updatedPayload);
                            // Retry booking with new prebookId
                            result = await invokeEdgeFunction('liteapi-book-v2', updatedPayload);
                        } else {
                            throw new Error("Could not refresh booking session");
                        }
                    } catch (refreshError) {
                        throw new Error("Booking session expired. Please go back and select the room again.");
                    } finally {
                        setPrebooking(false);
                    }
                } else {
                    throw bookingError;
                }
            }

            if (result && (result.data?.bookingId || result.data?.status === 'Confirmed')) {
                setBookingDetails({ bookingId: result.data.bookingId });
                setIsSuccess(true);
            } else {
                throw new Error("Booking failed - No Booking ID returned");
            }

        } catch (err: any) {
            console.error("Booking Error:", err);
            alert(`Booking Failed: ${err.message}\n\nPlease go back and select your room again.`);
        } finally {
            setLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <>
                <Header />
                <main className="min-h-screen pt-6 pb-20 px-4 flex items-center justify-center">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200 dark:border-white/10">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Booking Confirmed!</h1>
                        <p className="text-slate-500 mb-8">
                            Your reservation at <span className="font-semibold text-slate-900 dark:text-white">{property?.name || "Grand Sierra Pines"}</span> is complete.
                        </p>
                        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-lg mb-6 text-left text-sm">
                            <div className="mb-2"><span className="text-slate-500">Booking ID:</span> <span className="font-mono font-bold text-slate-900 dark:text-white">{useBookingStore.getState().bookingId}</span></div>
                            <div><span className="text-slate-500">Email sent to:</span> <span className="font-medium text-slate-900 dark:text-white">{formData.email}</span></div>
                        </div>
                        <div className="space-y-3">
                            <button onClick={() => router.push('/')} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors">
                                Return to Home
                            </button>
                        </div>
                    </div>
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
    const roomPrice = priceData ? priceData.price : (displayRoom.price * totalNights);
    const taxes = priceData ? priceData.tax : (roomPrice * 0.12);
    const totalPrice = priceData ? priceData.total : (roomPrice + taxes);

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

                    {prebookError && (
                        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-4 rounded-lg text-red-600 dark:text-red-400">
                            <strong>Error:</strong> {prebookError}
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
                                disabled={loading || prebooking || !!prebookError}
                                className={`w-full py-4 text-slate-900 font-bold text-lg rounded-xl shadow-lg transition-all flex items-center justify-center gap-2
                                    ${loading || prebooking ? 'bg-slate-300 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500 shadow-yellow-400/20'}
                                `}
                            >
                                {loading ? 'Processing Booking...' : prebooking ? 'Verifying Room...' : `Complete Booking • ₱${totalPrice.toLocaleString()}`}
                            </button>
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
                                        <span className="text-slate-900 dark:text-white">₱{totalPrice.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}


