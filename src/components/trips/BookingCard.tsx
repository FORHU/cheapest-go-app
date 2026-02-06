"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Calendar, MapPin, Users, Clock, XCircle, Pencil } from 'lucide-react';
import type { BookingRecord } from '@/lib/server/bookings';
import CancellationModal from './CancellationModal';
import ModificationModal from './ModificationModal';
import { statusColors, statusLabels } from '@/lib/constants';
import { formatDate, formatCurrency, calculateNights } from '@/lib/utils';

interface BookingCardProps {
    booking: BookingRecord;
    onBookingUpdated?: () => void;
}

export default function BookingCard({ booking, onBookingUpdated }: BookingCardProps) {
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);
    const checkInDate = new Date(booking.check_in);
    const checkOutDate = new Date(booking.check_out);
    const nights = calculateNights(checkInDate, checkOutDate);

    const fmtDate = (date: Date) =>
        formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');

    const fmtPrice = (price: number, currency: string) =>
        formatCurrency(price, currency || 'PHP');

    const isUpcoming = checkInDate > new Date();
    const isPast = checkOutDate < new Date();

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row">
                {/* Property Image */}
                <div className="relative w-full md:w-48 h-40 md:h-auto flex-shrink-0">
                    {booking.property_image ? (
                        <Image
                            src={booking.property_image}
                            alt={booking.property_name}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <MapPin className="w-12 h-12 text-white/50" />
                        </div>
                    )}
                    {/* Status Badge */}
                    <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-semibold ${statusColors[booking.status]}`}>
                        {statusLabels[booking.status]}
                    </div>
                </div>

                {/* Booking Details */}
                <div className="flex-1 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="flex-1">
                            {/* Property Name */}
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                                {booking.property_name}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                                {booking.room_name}
                            </p>

                            {/* Booking Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                {/* Dates */}
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <Calendar className="w-4 h-4 text-blue-500" />
                                    <div>
                                        <p className="font-medium">{fmtDate(checkInDate)}</p>
                                        <p className="text-xs text-slate-400">to {fmtDate(checkOutDate)}</p>
                                    </div>
                                </div>

                                {/* Duration */}
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <Clock className="w-4 h-4 text-purple-500" />
                                    <span>{nights} {nights === 1 ? 'night' : 'nights'}</span>
                                </div>

                                {/* Guests */}
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <Users className="w-4 h-4 text-green-500" />
                                    <span>
                                        {booking.guests_adults} {booking.guests_adults === 1 ? 'adult' : 'adults'}
                                        {booking.guests_children > 0 && `, ${booking.guests_children} ${booking.guests_children === 1 ? 'child' : 'children'}`}
                                    </span>
                                </div>

                                {/* Booking ID */}
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <span className="text-xs font-mono">ID: {booking.booking_id}</span>
                                </div>
                            </div>
                        </div>

                        {/* Price & Actions */}
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-white/5">
                            <div className="text-right">
                                <p className="text-xs text-slate-400 dark:text-slate-500">Total paid</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">
                                    {fmtPrice(booking.total_price, booking.currency)}
                                </p>
                            </div>

                            {isUpcoming && booking.status === 'confirmed' && (
                                <div className="flex flex-col items-end gap-2">
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        Upcoming
                                    </span>
                                    <button
                                        onClick={() => setShowModifyModal(true)}
                                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Modify booking
                                    </button>
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-colors"
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Cancel booking
                                    </button>
                                </div>
                            )}

                            {isPast && booking.status === 'confirmed' && (
                                <span className="text-xs text-slate-400">
                                    Trip completed
                                </span>
                            )}

                            {booking.status === 'cancelled' && (
                                <span className="text-xs text-red-500 dark:text-red-400">
                                    Booking cancelled
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modification Modal */}
            <ModificationModal
                booking={booking}
                isOpen={showModifyModal}
                onClose={() => setShowModifyModal(false)}
                onModified={() => {
                    setShowModifyModal(false);
                    onBookingUpdated?.();
                }}
            />

            {/* Cancellation Modal */}
            <CancellationModal
                booking={booking}
                isOpen={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                onCancelled={() => {
                    setShowCancelModal(false);
                    onBookingUpdated?.();
                }}
            />
        </div>
    );
}
