'use client';

import { useState, useCallback, useEffect } from 'react';
import { useUser } from '@/stores/authStore';
import { bookingService, BookingRecord } from '@/services/booking.service';

interface UseTripsDataReturn {
    bookings: BookingRecord[];
    isLoading: boolean;
    error: string | null;
    upcomingBookings: BookingRecord[];
    pastBookings: BookingRecord[];
    cancelledBookings: BookingRecord[];
    refetch: () => Promise<void>;
}

/**
 * Hook for fetching and managing user trip/booking data.
 * Handles loading, error states, and categorization.
 */
export function useTripsData(): UseTripsDataReturn {
    const user = useUser();
    const [bookings, setBookings] = useState<BookingRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchBookings = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await bookingService.getUserBookings();
            setBookings(data);
        } catch (err: any) {
            console.error('Failed to fetch bookings:', err);
            setError(err.message || 'Failed to load your trips');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Auto-fetch when user is authenticated
    useEffect(() => {
        if (user) {
            fetchBookings();
        }
    }, [user, fetchBookings]);

    // Categorize bookings
    const now = new Date();
    const upcomingBookings = bookings.filter(b => new Date(b.check_in) >= now && b.status !== 'cancelled');
    const pastBookings = bookings.filter(b => new Date(b.check_out) < now || b.status === 'completed');
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled');

    return {
        bookings,
        isLoading,
        error,
        upcomingBookings,
        pastBookings,
        cancelledBookings,
        refetch: fetchBookings,
    };
}
