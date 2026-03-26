import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { type Property } from '@/types';
import type { RoomType } from '@/lib/room/roomUtils';

export interface Room {
    id: string;
    offerId?: string;
    title: string;
    price: number;
    currency?: string;
    description?: string;
}

/** Room data used for the room detail view */
export type ViewingRoom = RoomType;

export interface BookingState {
    property: Property | null;
    selectedRoom: Room | null;
    prebookId?: string | null;
    transactionId?: string | null;
    bookingId?: string | null;
    checkIn: Date | null;
    checkOut: Date | null;
    adults: number;
    children: number;
    viewingRoom: ViewingRoom | null;

    // Actions
    setProperty: (property: Property | null) => void;
    setSelectedRoom: (room: Room | null) => void;
    setPrebookId: (id: string | null) => void;
    setTransactionId: (id: string | null) => void;
    setBookingId: (id: string | null) => void;
    setDates: (checkIn: Date | null, checkOut: Date | null) => void;
    setGuests: (adults: number, children: number) => void;
    setViewingRoom: (room: ViewingRoom | null) => void;
    resetBooking: () => void;
}

export const useBookingStore = create<BookingState>()(
    persist(
        (set) => ({
            property: null,
            selectedRoom: null,
            checkIn: null,
            checkOut: null,
            adults: 2,
            children: 0,
            viewingRoom: null,

            setProperty: (property) => set({ property }),
            setSelectedRoom: (room) => set({ selectedRoom: room }),
            setPrebookId: (id) => set({ prebookId: id }),
            setTransactionId: (id) => set({ transactionId: id }),
            setBookingId: (id) => set({ bookingId: id }),
            setDates: (checkIn, checkOut) => set({ checkIn, checkOut }),
            setGuests: (adults, children) => set({ adults, children }),
            setViewingRoom: (room) => set({ viewingRoom: room }),

            resetBooking: () => set({
                property: null,
                selectedRoom: null,
                prebookId: null,
                transactionId: null,
                bookingId: null,
                checkIn: null,
                checkOut: null,
                adults: 2,
                children: 0,
                viewingRoom: null
            }),
        }),
        {
            name: 'cheapestgo-booking',
            storage: {
                getItem: (name) => {
                    if (typeof window === 'undefined') return null;
                    const str = localStorage.getItem(name);
                    if (!str) return null;
                    const parsed = JSON.parse(str);
                    return {
                        state: {
                            ...parsed.state,
                            checkIn: parsed.state.checkIn ? new Date(parsed.state.checkIn) : null,
                            checkOut: parsed.state.checkOut ? new Date(parsed.state.checkOut) : null,
                        }
                    };
                },
                setItem: (name, value) => {
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(name, JSON.stringify(value));
                    }
                },
                removeItem: (name) => {
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem(name);
                    }
                },
            }
        }
    )
);

// Granular Selectors — prevent unnecessary re-renders

export const useProperty = () => useBookingStore((state) => state.property);
export const useSelectedRoom = () => useBookingStore((state) => state.selectedRoom);
export const usePrebookId = () => useBookingStore((state) => state.prebookId);
export const useTransactionId = () => useBookingStore((state) => state.transactionId);
export const useBookingId = () => useBookingStore((state) => state.bookingId);

export const useBookingDates = () =>
    useBookingStore(
        useShallow((state) => ({
            checkIn: state.checkIn,
            checkOut: state.checkOut,
        }))
    );

export const useGuestCount = () =>
    useBookingStore(
        useShallow((state) => ({
            adults: state.adults,
            children: state.children,
        }))
    );

export const useViewingRoom = () => useBookingStore((state) => state.viewingRoom);

export const useBookingActions = () =>
    useBookingStore(
        useShallow((state) => ({
            setProperty: state.setProperty,
            setSelectedRoom: state.setSelectedRoom,
            setPrebookId: state.setPrebookId,
            setTransactionId: state.setTransactionId,
            setBookingId: state.setBookingId,
            setDates: state.setDates,
            setGuests: state.setGuests,
            setViewingRoom: state.setViewingRoom,
            resetBooking: state.resetBooking,
        }))
    );
