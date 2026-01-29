import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { Property } from '@/data/mockProperties';

export interface Room {
    id: string; // Add ID for better management
    offerId?: string; // LiteAPI Offer ID for booking
    title: string;
    price: number;
    description?: string;
}

export interface BookingState {
    property: Property | null;
    selectedRoom: Room | null;
    prebookId?: string | null; // Store Prebook ID
    transactionId?: string | null; // Store Transaction ID from prebook
    bookingId?: string | null; // Store Confirmed Booking ID
    checkIn: Date | null;
    checkOut: Date | null;
    adults: number;
    children: number;
    viewingRoom: any | null; // Room being viewed in modal

    // Actions - Granular setters (Phase 2)
    setProperty: (property: Property | null) => void;
    setSelectedRoom: (room: Room | null) => void;
    setPrebookId: (id: string | null) => void;
    setTransactionId: (id: string | null) => void;
    setBookingId: (id: string | null) => void;
    setDates: (checkIn: Date | null, checkOut: Date | null) => void;
    setGuests: (adults: number, children: number) => void;
    setViewingRoom: (room: any | null) => void;

    /** @deprecated Use specific setters instead (setProperty, setSelectedRoom, etc.) */
    setBookingDetails: (details: Partial<BookingState>) => void;
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

            // Granular action methods (Phase 2)
            setProperty: (property) => set({ property }),
            setSelectedRoom: (room) => set({ selectedRoom: room }),
            setPrebookId: (id) => set({ prebookId: id }),
            setTransactionId: (id) => set({ transactionId: id }),
            setBookingId: (id) => set({ bookingId: id }),
            setDates: (checkIn, checkOut) => set({ checkIn, checkOut }),
            setGuests: (adults, children) => set({ adults, children }),
            setViewingRoom: (room) => set({ viewingRoom: room }),

            // Deprecated: Use specific setters instead
            setBookingDetails: (details) => set((state) => ({ ...state, ...details })),

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
            name: 'aerovantage-booking',
            // We need to handle Date serialization/deserialization if persisting
            // But for a simple prototype, standard JSON stringify is often okay, 
            // though dates turn to strings. We might need a storage wrapper or just handle strings in components.
            // For simplicity in this mock, let's just let it persist and we handle the date string conversion in components if needed.
            // Actually, better to avoid persisting complex objects if we can, 
            // but for a smooth "refresh page" experience, persist is good.
            storage: {
                getItem: (name) => {
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
                    localStorage.setItem(name, JSON.stringify(value));
                },
                removeItem: (name) => localStorage.removeItem(name),
            }
        }
    )
);

// Granular Selectors (Phase 2)
// These prevent unnecessary re-renders by subscribing to specific state slices

/** Select only the property */
export const useProperty = () => useBookingStore((state) => state.property);

/** Select only the selected room */
export const useSelectedRoom = () => useBookingStore((state) => state.selectedRoom);

/** Select only the prebook ID */
export const usePrebookId = () => useBookingStore((state) => state.prebookId);

/** Select only the transaction ID */
export const useTransactionId = () => useBookingStore((state) => state.transactionId);

/** Select only the booking ID */
export const useBookingId = () => useBookingStore((state) => state.bookingId);

/** Select check-in and check-out dates */
export const useBookingDates = () =>
    useBookingStore(
        useShallow((state) => ({
            checkIn: state.checkIn,
            checkOut: state.checkOut,
        }))
    );

/** Select guest counts */
export const useGuestCount = () =>
    useBookingStore(
        useShallow((state) => ({
            adults: state.adults,
            children: state.children,
        }))
    );

/** Select viewing room */
export const useViewingRoom = () => useBookingStore((state) => state.viewingRoom);

/** Select actions only (for components that only need to update state) */
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
            setBookingDetails: state.setBookingDetails,
            resetBooking: state.resetBooking,
        }))
    );
