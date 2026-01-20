// API Response wrapper
export interface ApiResponse<T> {
    data: T | null;
    error: ApiError | null;
    status: 'success' | 'error' | 'loading';
}

// API Error type
export interface ApiError {
    message: string;
    code?: string;
    status?: number;
}

// Pagination
export interface PaginationParams {
    page: number;
    limit: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

// Travel-specific types
export interface Destination {
    id: string;
    name: string;
    coords: string;
    price: number;
    image: string;
    tag?: string;
}

export interface TelemetryData {
    label: string;
    value: string;
    subValue: string;
    trend: 'up' | 'down' | 'stable';
    icon: 'chart' | 'plane' | 'sun';
}

// Booking types (for future use)
export interface Booking {
    id: string;
    userId: string;
    destinationId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    status: BookingStatus;
    createdAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
