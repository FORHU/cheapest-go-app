"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, XCircle, Pencil, CalendarCheck, Moon, User, Download, AlertTriangle, Map, BedDouble } from 'lucide-react';

const TripMapView = dynamic(() => import('./TripMapView'), { ssr: false });
import type { BookingRecord } from '@/services/booking.service';
import CancellationModal from './CancellationModal';
import ModificationModal from './ModificationModal';
import { formatDate, formatCurrency, calculateNights } from '@/lib/utils';
import type { BookingPolicyType } from '@/types/booking-policy';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import {
    BookingCardShell, dangerActionClass, ghostActionClass, linkActionClass, primaryActionClass, type StatusTone,
} from './BookingCardShell';

interface BookingCardProps {
    booking: BookingRecord;
    onBookingUpdated?: () => void;
}

/** One status vocabulary for every kind of booking, so a state looks the same in every card. */
const STATUS_TONE: Record<BookingRecord['status'], StatusTone> = {
    pending: 'amber',
    confirmed: 'emerald',
    completed: 'blue',
    cancelled: 'slate',
    cancelled_refunded: 'slate',
    cancelled_refund_failed: 'rose',
};

/** The page's translated status vocabulary, by the stored state. */
const STATUS_KEY: Record<BookingRecord['status'], string> = {
    pending: 'pending',
    confirmed: 'confirmed',
    completed: 'completed',
    cancelled: 'cancelled',
    cancelled_refunded: 'cancelled',
    cancelled_refund_failed: 'refundFailed',
};

/**
 * A hotel booking in the bookings list, in the shared card shell. The photograph leads; the rest
 * is the stay, the room and its rules, and what was paid. Cancelling and modifying keep their own
 * dialogs: this card only decides when they are offered.
 */
export default function BookingCard({ booking, onBookingUpdated }: BookingCardProps) {
    const t = useTranslations('trips');
    const locale = useLocale();
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);
    const [showMapView, setShowMapView] = useState(false);
    const liveUserCurrency = useUserCurrency();
    const bookingCurrency = booking.currency || 'USD';
    const [displayPrice, setDisplayPrice] = useState(booking.total_price);
    const [displayCurrency, setDisplayCurrency] = useState(bookingCurrency);
    // Depends on liveUserCurrency so the currency selector actually takes effect;
    // with [] the price stayed in whatever currency was active at mount until a
    // full page reload. Still does not re-run on a bare exchange-rate refresh, so
    // the figure doesn't drift on its own.
    useEffect(() => {
        setDisplayPrice(Math.round(convertCurrency(booking.total_price, bookingCurrency, liveUserCurrency)));
        setDisplayCurrency(liveUserCurrency);
    }, [liveUserCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    const checkInDate = new Date(booking.check_in);
    const checkOutDate = new Date(booking.check_out);
    const nights = calculateNights(checkInDate, checkOutDate);

    const fmtDate = (date: Date) =>
        formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' }, locale);

    const normalizedStatus = booking.status?.toLowerCase() as typeof booking.status;
    const isUpcoming = checkInDate > new Date();
    const isPast = checkOutDate < new Date();
    const policyType = (booking.policy_type || 'non_refundable') as BookingPolicyType;
    const cancelled = normalizedStatus === 'cancelled' || normalizedStatus === 'cancelled_refunded';

    const guests = t(booking.guests_adults === 1 ? 'bookingCard.adult' : 'bookingCard.adults', { count: booking.guests_adults })
        + (booking.guests_children > 0
            ? `, ${t(booking.guests_children === 1 ? 'bookingCard.child' : 'bookingCard.children', { count: booking.guests_children })}`
            : '');

    const pill = 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300';

    const policyLabel = policyType === 'free_cancellation'
        ? t('bookingCard.policyBadges.freeCancellation')
        : policyType === 'non_refundable'
            ? t('bookingCard.policyBadges.nonRefundable')
            : t('bookingCard.policyBadges.partialRefund');

    const canChange = isUpcoming && normalizedStatus === 'confirmed';

    return (
        <>
            <BookingCardShell
                lead={(
                    <div className="relative h-36 overflow-hidden bg-slate-100 dark:bg-slate-800 sm:h-full sm:min-h-[168px]">
                        {booking.property_image ? (
                            <Image
                                src={booking.property_image}
                                alt={booking.property_name}
                                fill
                                sizes="(min-width: 640px) 120px, 100vw"
                                className={`object-cover ${cancelled ? 'grayscale opacity-80' : ''}`}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <MapPin className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden />
                            </div>
                        )}
                    </div>
                )}
                typeIcon={BedDouble}
                typeLabel={t('bookingCard.typeLabel')}
                status={{ tone: STATUS_TONE[normalizedStatus] ?? 'slate', label: t(`status.${STATUS_KEY[normalizedStatus] ?? 'unknown'}`) }}
                title={booking.property_name}
                facts={[
                    { icon: CalendarCheck, label: t('bookingCard.stayDates', { from: fmtDate(checkInDate), to: fmtDate(checkOutDate) }), mono: true },
                    { icon: Moon, label: t(nights === 1 ? 'bookingCard.night' : 'bookingCard.nights', { count: nights }) },
                    { icon: User, label: guests },
                ]}
                footnote={(booking.cancellation_policy || booking.room_name || (isPast && normalizedStatus === 'confirmed')) && (
                    <div className="flex flex-wrap items-center gap-2">
                        {booking.cancellation_policy && <span className={pill}>{policyLabel}</span>}
                        {booking.room_name && <span className={pill}>{booking.room_name}</span>}
                        {isPast && normalizedStatus === 'confirmed' && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('bookingCard.tripCompleted')}</span>
                        )}
                    </div>
                )}
                money={{
                    amount: formatCurrency(displayPrice, displayCurrency),
                    caption: t('bookingCard.totalPaid'),
                    muted: cancelled,
                }}
                primary={
                    <Link href={`/trips/${booking.id}`} className={primaryActionClass}>
                        {t('bookingCard.actions.details')}
                    </Link>
                }
                actions={
                    <>
                        {canChange && (
                            <>
                                <button type="button" onClick={() => setShowModifyModal(true)} className={ghostActionClass}>
                                    <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                                    {t('bookingCard.actions.modify')}
                                </button>
                                <button type="button" onClick={() => setShowCancelModal(true)} className={dangerActionClass}>
                                    <XCircle className="h-4 w-4 shrink-0" aria-hidden />
                                    {t('bookingCard.actions.cancel')}
                                </button>
                            </>
                        )}
                        {normalizedStatus === 'cancelled_refund_failed' && (
                            <button type="button" onClick={() => setShowCancelModal(true)} className={dangerActionClass}>
                                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                                {t('bookingCard.actions.retryRefund')}
                            </button>
                        )}
                    </>
                }
                links={
                    <>
                        <a
                            href={`/trips/invoice/${booking.id}?type=hotel`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={linkActionClass}
                        >
                            <Download className="h-4 w-4 shrink-0" aria-hidden />
                            {t('bookingCard.actions.receipt')}
                        </a>
                        <button type="button" onClick={() => setShowMapView(true)} className={linkActionClass}>
                            <Map className="h-4 w-4 shrink-0" aria-hidden />
                            {t('bookingCard.actions.map')}
                        </button>
                    </>
                }
            />

            {/* Trip map full-screen view */}
            {showMapView && (
                <TripMapView booking={booking} onClose={() => setShowMapView(false)} />
            )}

            {/* Modals */}
            <ModificationModal
                booking={booking}
                isOpen={showModifyModal}
                onClose={() => setShowModifyModal(false)}
                onModified={() => {
                    setShowModifyModal(false);
                    onBookingUpdated?.();
                }}
            />

            <CancellationModal
                booking={booking}
                isOpen={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                onCancelled={() => {
                    setShowCancelModal(false);
                    onBookingUpdated?.();
                }}
            />
        </>
    );
}
