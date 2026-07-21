import type { BookingRecord } from '@/services/booking.service';

type BookingStatus = BookingRecord['status'];

export const statusColors: Record<BookingStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled_refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled_refund_failed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export const statusLabels: Record<BookingStatus, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    cancelled_refunded: 'Cancelled',
    cancelled_refund_failed: 'Refund Failed',
};
