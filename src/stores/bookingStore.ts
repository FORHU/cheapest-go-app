import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Property } from '@/data/mockProperties';

export interface Room {
    id: string; // Add ID for better management
    title: string;
    price: number;
    description?: string;
}

export interface BookingState {
    property: Property | null;
    selectedRoom: Room | null;
    checkIn: Date | null;
    checkOut: Date | null;
    adults: number;
    children: number;

    // Actions
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

            setBookingDetails: (details) => set((state) => ({ ...state, ...details })),
            resetBooking: () => set({
                property: null,
                selectedRoom: null,
                checkIn: null,
                checkOut: null,
                adults: 2,
                children: 0
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
