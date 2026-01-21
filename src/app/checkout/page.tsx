"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/stores/bookingStore';
import { Header, Footer } from '@/components/landing';
import { ChevronLeft, Lock, CreditCard, ShieldCheck, CheckCircle } from 'lucide-react';
import BackButton from '@/components/common/BackButton';

export default function CheckoutPage() {
    const router = useRouter();
    const { property, selectedRoom, checkIn, checkOut, adults, children } = useBookingStore();
    const [isSuccess, setIsSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    // Redirect if no booking data (optional, but good for UX)
    useEffect(() => {
        if (!property || !selectedRoom) {
            // allowing it for now for dev/mock viewing, but usually would redirect
            // router.push('/'); 
        }
    }, [property, selectedRoom, router]);

    const handleCompleteBooking = () => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setIsSuccess(true);
            // Could redirect to a success page or show modal
        }, 2000);
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
                        <div className="space-y-3">
                            <button onClick={() => router.push('/')} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors">
                                Return to Home
                            </button>
                            <button onClick={() => router.push('/account')} className="w-full py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                                View My Trips
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
    const totalNights = 2;
    const taxes = displayRoom.price * 0.12 * totalNights;
    const totalPrice = (displayRoom.price * totalNights) + taxes;

    return (
        <>
            <Header />
            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-2">
                        <BackButton label="Modify booking" />
                    </div>

                    <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-8">
                        Secure your booking
                    </h1>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Form */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Alert Mock */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-4 rounded-lg flex gap-3 text-sm text-amber-800 dark:text-amber-200">
                                <span className="font-bold">✨ Great choice!</span>
                                This property is in high demand. Book now to secure your room.
                            </div>

                            {/* User Details */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <UserIcon size={20} className="text-blue-600" />
                                    Who's checking in?
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">First Name</label>
                                        <input type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="e.g. John" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Last Name</label>
                                        <input type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="e.g. Doe" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Mobile Phone</label>
                                        <input type="tel" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="+63 900 000 0000" />
                                        <p className="text-xs text-slate-400 mt-1">We'll send booking confirmation to this number.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Payment */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-blue-600" />
                                    Payment
                                </h2>
                                <div className="flex gap-4 mb-6">
                                    <button className="flex-1 py-3 border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold rounded-lg flex items-center justify-center gap-2">
                                        <CreditCard size={18} /> Card
                                    </button>
                                    <button className="flex-1 py-3 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 font-bold rounded-lg">
                                        PayPal
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input type="text" className="w-full p-3 pl-10 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Card Number" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="MM / YY" />
                                        <input type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="CVC" />
                                    </div>
                                    <input type="text" className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500" placeholder="Name on Card" />
                                </div>

                                <div className="mt-6 flex items-start gap-3">
                                    <ShieldCheck className="text-green-600 shrink-0 mt-0.5" size={18} />
                                    <p className="text-xs text-slate-500">
                                        Your payment information is secured with industry-standard encryption. We mock this, so don't enter real details.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleCompleteBooking}
                                disabled={loading}
                                className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold text-lg rounded-xl shadow-lg shadow-yellow-400/20 transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? 'Processing...' : `Complete Booking • ₱${totalPrice.toLocaleString()}`}
                            </button>
                        </div>

                        {/* Sidebar Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-lg sticky top-24">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Booking Summary</h3>

                                <div className="mb-6">
                                    <div className="font-bold text-slate-900 dark:text-white">{displayProperty.name}</div>
                                    <div className="text-sm text-slate-500">{displayRoom.title}</div>
                                    {/* Mock Rating */}
                                    <div className="text-xs font-medium text-emerald-600 mt-1">4.8/5 Excellent (120 reviews)</div>
                                </div>

                                <div className="space-y-4 border-t border-slate-100 dark:border-white/5 pt-4 mb-6">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Check-in</span>
                                        <span className="font-medium text-slate-900 dark:text-white">Jan 23</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Check-out</span>
                                        <span className="font-medium text-slate-900 dark:text-white">Jan 25</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Guests</span>
                                        <span className="font-medium text-slate-900 dark:text-white">{adults} Adults, {children} Children</span>
                                    </div>
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

function UserIcon({ size, className }: { size: number, className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    )
}
