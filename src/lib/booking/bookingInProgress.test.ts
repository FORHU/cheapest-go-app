import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBookingStore } from '@/stores/bookingStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { useAuthStore } from '@/stores/authStore';
import { claimBookingInProgress, clearBookingInProgress } from './bookingInProgress';

/**
 * QA BG-1: account A reached checkout, signed out, account B signed in on the same browser
 * and opened /checkout onto A's booking with A's name, email and phone filled in.
 */

function startBookingAsA() {
    useBookingStore.setState({
        property: { id: 'hotel-1', name: 'Hotel A' } as never,
        selectedRoom: { id: 'room-1', title: 'Double', price: 100 },
        checkIn: new Date('2026-10-01'),
        checkOut: new Date('2026-10-03'),
    });
    useCheckoutStore.setState(s => ({
        formData: { ...s.formData, firstName: 'Alice', lastName: 'Anders', email: 'alice@example.test', phone: '9171234567' },
        specialRequests: 'Late check-in',
    }));
    sessionStorage.setItem('flightPassengers', '[{"firstName":"Alice"}]');
    sessionStorage.setItem('flightContact', '{"email":"alice@example.test"}');
}

const bookingLeft = () => ({
    property: useBookingStore.getState().property,
    firstName: useCheckoutStore.getState().formData.firstName,
    email: useCheckoutStore.getState().formData.email,
    specialRequests: useCheckoutStore.getState().specialRequests,
    passengers: sessionStorage.getItem('flightPassengers'),
    contact: sessionStorage.getItem('flightContact'),
});

const signIn = (id: string) => useAuthStore.setState({ user: { id, email: `${id}@example.test`, firstName: id, lastName: '', role: 'user' } as never });

beforeEach(() => {
    clearBookingInProgress();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({ user: null });
});

describe('Booking in progress across accounts', () => {
    it('is wiped when the account signs out', async () => {
        signIn('user-a');
        startBookingAsA();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

        await useAuthStore.getState().logout();

        expect(bookingLeft()).toEqual({ property: null, firstName: '', email: '', specialRequests: '', passengers: null, contact: null });
        vi.unstubAllGlobals();
    });

    it('is wiped on sign-out even when the sign-out request fails', async () => {
        signIn('user-a');
        startBookingAsA();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        await expect(useAuthStore.getState().logout()).rejects.toThrow();

        expect(bookingLeft().firstName).toBe('');
        expect(bookingLeft().passengers).toBeNull();
        vi.unstubAllGlobals();
    });

    it('is wiped when a different account signs in without anyone signing out', () => {
        // A session that expired: the user becomes null without logout(), then B signs in.
        signIn('user-a');
        startBookingAsA();
        useAuthStore.setState({ user: null });

        signIn('user-b');

        expect(bookingLeft().property).toBeNull();
        expect(bookingLeft().email).toBe('');
        expect(bookingLeft().contact).toBeNull();
    });

    it('survives the same account signing back in', () => {
        signIn('user-a');
        startBookingAsA();
        useAuthStore.setState({ user: null });

        signIn('user-a');

        expect(bookingLeft().firstName).toBe('Alice');
        expect(bookingLeft().property).not.toBeNull();
    });

    it('is kept for whoever signs in when it was started signed out (ADR-0027 funnel)', () => {
        startBookingAsA();

        signIn('user-b');

        expect(bookingLeft().firstName).toBe('Alice');
        expect(bookingLeft().property).not.toBeNull();
    });

    it('does nothing when there is no owner yet', () => {
        claimBookingInProgress('user-a');
        startBookingAsA();
        claimBookingInProgress('user-a');
        expect(bookingLeft().firstName).toBe('Alice');
    });
});
