"use client";

import React from 'react';

interface MobileBookingCTAProps {
    price: number;
    currency: string;
}

const MobileBookingCTA: React.FC<MobileBookingCTAProps> = ({ price, currency }) => {
    const currencySymbol = currency === 'PHP' ? '₱' : currency === 'USD' ? '$' : currency;

    const handleViewRooms = () => {
        const section = document.getElementById('room-list-section');
        if (section) {
            const offset = section.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: offset, behavior: 'smooth' });
        }
    };

    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 py-3">
                <div>
                    {price > 0 ? (
                        <>
                            <p className="text-xs text-slate-500 dark:text-slate-400">From</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                                {currencySymbol}{price.toLocaleString()}
                                <span className="text-xs font-normal text-slate-500">/night</span>
                            </p>
                        </>
                    ) : (
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Check room rates
                        </p>
                    )}
                </div>

                <button
                    onClick={handleViewRooms}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-full text-sm transition-colors shadow-lg shadow-blue-500/20"
                >
                    View Rooms
                </button>
            </div>
        </div>
    );
};

export default MobileBookingCTA;
