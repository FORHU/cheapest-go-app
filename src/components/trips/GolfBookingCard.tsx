"use client";

import React from 'react';
import Link from 'next/link';
import { Clock, Flag, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TripGolfBooking, TripGolfStatus } from '@/lib/trips/golfBookings';
import { BookingCardShell, DateBlock, primaryActionClass, type StatusTone } from './BookingCardShell';

/**
 * A golf booking in the bookings list, drawn in the shared card shell so it sits with hotels and
 * flights. Cancelling, the receipt and the rest live on the booking's own page, which this links
 * to, so the one rule for them is not copied here.
 */

const STATUS_TONE: Record<TripGolfStatus, StatusTone> = {
    requested: 'amber',
    confirmed: 'emerald',
    declined: 'rose',
    cancelled: 'slate',
};

/** Whole amounts without cents, real cents kept: "$491" and "$491.37", as the other cards set money. */
function money(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
    } catch {
        return `${currency} ${amount}`;
    }
}

export default function GolfBookingCard({ booking }: { booking: TripGolfBooking }) {
    const t = useTranslations('trips.golfCard');
    const tPaid = useTranslations('trips.bookingCard');
    const locale = useLocale();

    // The tee time is read on the course's clock: that is the one the golfer will play by.
    const zone = booking.timezone ? { timeZone: booking.timezone } : {};
    const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', ...zone }).format(new Date(booking.startsAt));

    // Nothing was taken for a declined or cancelled booking, so its amount steps back.
    const notCharged = booking.status === 'declined' || booking.status === 'cancelled';
    // The date takes the accent only while the tee time is still ahead and still on.
    const ahead = !notCharged && new Date(booking.startsAt).getTime() >= Date.now();

    return (
        <BookingCardShell
            lead={<DateBlock iso={booking.startsAt} timeZone={booking.timezone} locale={locale} tone={ahead ? 'upcoming' : 'inactive'} />}
            typeIcon={Flag}
            typeLabel={t('badge')}
            status={{ tone: STATUS_TONE[booking.status], label: t(`status.${booking.status}`) }}
            title={booking.courseName}
            subtitle={booking.city}
            facts={[
                { icon: Clock, label: time, mono: true },
                { icon: Users, label: t(booking.players === 1 ? 'player' : 'players', { count: booking.players }) },
                { label: t('reference', { reference: booking.reference }), mono: true },
            ]}
            money={{
                amount: money(booking.total, booking.currency, locale),
                muted: notCharged,
                // A request is authorised, not paid, until the team confirms with the course.
                caption: booking.status === 'confirmed' ? tPaid('totalPaid')
                    : booking.status === 'requested' ? t('chargedOnConfirmation')
                        : undefined,
            }}
            primary={
                <Link href={`/golf/bookings/${booking.reference}`} className={primaryActionClass}>
                    {t('view')}
                    <span className="sr-only">: {booking.courseName}</span>
                </Link>
            }
        />
    );
}
