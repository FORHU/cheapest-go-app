export interface DashboardStats {
    totalBookings: number;
    revenue: number;
    pendingBookings: number;
    cancelledBookings: number;
}

export interface AnalyticsData {
    day: string;
    value: number;
    displayValue: number;
    type: 'actual' | 'projected';
}

export interface SupplierBreakdown {
    name: string;
    value: number; // percentage
    count: number; // absolute count
    color: string;
    bg: string;
}

export interface RecentActivity {
    id: string;
    user: string;
    action: string;
    time: string;
    amount: string;
    type: string;
}

export interface RevenueStats {
    dailyRevenue: number;
    monthlyRevenue: number;
    revenueByProvider: { provider: string; amount: number }[];
    totalMarkup: number;
    totalProfit: number;
    refundRate: number;
    failedRate: number;
    pendingRate: number;
}

export interface AdvancedAnalyticsData {
    providerSuccess: {
        name: string;
        success: number;
        failure: number;
    }[];
    ticketingLatency: {
        day: string;
        avgSeconds: number;
    }[];
    errorLogs: {
        id: string;
        timestamp: string;
        functionName: string;
        message: string;
        status: number;
    }[];
}

export interface RevenueTrend {
    date: string;
    revenue: number;
}

export interface ConversionFunnel {
    searches: number;
    quotes: number;
    confirmed: number;
}

export interface RouteMetric {
    destination: string;
    count: number;
    revenue: number;
}

export interface DashboardData {
    stats: DashboardStats;
    analytics: AnalyticsData[];
    supplierBreakdown: SupplierBreakdown[];
    recentActivity: RecentActivity[];
    revenueTrend: {
        daily: RevenueTrend[];
        weekly: RevenueTrend[];
        monthly: RevenueTrend[];
    };
    revenueStats: RevenueStats;
    conversionFunnel: ConversionFunnel;
    topRoutes: RouteMetric[];
    providerIntegrations: ProviderIntegrationsData;
    defaultCurrency: string;
}

export interface Booking {
    id: string;
    bookingRef: string;
    type: "flight" | "hotel" | "bundle" | "hotel_bundle";
    supplier: string;
    customerName: string;
    email: string;
    totalAmount: number;
    supplierCost: number;
    markupAmount: number;
    profit: number;
    currency: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    ticketIds: string[];
    ticketStatus: string;
    pnr: string;
    paymentIntentId: string;
    isRefundable: boolean;
    markup_pct?: number;
    metadata?: Record<string, any>;
}

export interface Customer {
    id: string;
    name: string;
    email: string;
    loyaltyTier: 'platinum' | 'gold' | 'silver' | 'bronze';
    status: 'active' | 'inactive' | 'banned';
    joined: string;
    totalSpend: number;
    totalBookings: number;
    lastBooking: string;
}

export interface Notification {
    id: string;
    title: string;
    description: string;
    type: 'booking' | 'system' | 'alert';
    read: boolean;
    created_at: string;
}

/**
 * Full unified_bookings row returned by admin recovery tools
 */
export interface BookingRawData {
    id: string;
    user_id: string;
    type: 'flight' | 'hotel';
    provider: string;
    external_id: string | null;
    status: string;
    total_price: number;
    currency: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

/**
 * Result of an admin recovery action
 */
export interface RecoveryActionResult {
    success: boolean;
    message: string;
    newStatus?: string;
    data?: Record<string, unknown>;
}

export interface MonitoringData {
    failedBookings: any[];
    mismatches: {
        id: string;
        provider: string;
        payment_intent_id: string;
        created_at: string;
        status: string;
        customer: string;
    }[];
    awaitingTickets: {
        id: string;
        provider: string;
        pnr: string;
        customerName: string;
        total_price: number;
        currency: string;
        created_at: string;
        ticket_time_limit: string | null;
    }[];
    stats: {
        failedCount: number;
        mismatchCount: number;
        awaitingCount: number;
    };
}

// Provider Integration types

export type ProviderStatus = 'healthy' | 'error' | 'not_configured';

export interface StripeProviderData {
    status: ProviderStatus;
    balance: number | null;
    recentPaymentCount: number | null;
    totalVolume: number | null;
    refundCount: number | null;
    errorMessage?: string;
}

export interface ResendProviderData {
    status: ProviderStatus;
    recentEmailCount: number | null;
    deliveryRate: number | null;
    domainStatus: string | null;
    errorMessage?: string;
}

export interface DuffelOrder {
    id: string;
    bookingReference: string;
    passengerName: string;
    origin: string;
    destination: string;
    departureDate: string;
    totalAmount: string;
    currency: string;
    status: 'confirmed' | 'cancelled' | 'awaiting_payment';
    createdAt: string;
}

export interface LiteApiProviderData {
    status: ProviderStatus;
    searchCount: number | null;
    bookingCount: number | null;
    errorMessage?: string;
}

export interface DuffelAirlineMetric {
    name: string;
    iataCode: string;
    count: number;
    value: number;
    currency: string;
}

export interface DuffelRouteMetric {
    route: string;
    origin: string;
    destination: string;
    count: number;
    value: number;
    currency: string;
}

export interface DuffelDayPoint {
    date: string;   // YYYY-MM-DD
    orders: number;
    value: number;
}

export interface DuffelProviderData {
    status: ProviderStatus;

    // ── Core counters (last 30 days) ──────────────────────
    ordersCreated: number | null;
    grossOrderValue: number | null;
    orderCurrency: string | null;

    // ── Change metrics ────────────────────────────────────
    ordersCancelled: number | null;
    ordersChanged: number | null;

    // ── Ancillaries ───────────────────────────────────────
    ancillariesSold: number | null;
    grossAncillaryVolume: number | null;
    ancillaryAttachmentRate: number | null;  // 0–100 %

    // ── Timeseries (last 30 days) ─────────────────────────
    dailyOrdersChart: DuffelDayPoint[];

    // ── Top airlines ──────────────────────────────────────
    topAirlinesByVolume: DuffelAirlineMetric[];
    topAirlinesByValue: DuffelAirlineMetric[];

    // ── Top routes ────────────────────────────────────────
    topRoutesByVolume: DuffelRouteMetric[];
    topRoutesByValue: DuffelRouteMetric[];

    // ── Recent order rows for the table ───────────────────
    recentOrders: DuffelOrder[];

    // ── Legacy / compat fields ────────────────────────────
    /** @deprecated use ordersCreated */
    recentOrderCount: number | null;
    lastOrderDate: string | null;
    passengerCount: number | null;

    errorMessage?: string;
}

export interface MystiflyProviderData {
    status: ProviderStatus;
    bookingCount: number | null;
    configStatus: string | null;
    errorMessage?: string;
}

export interface ProviderIntegrationsData {
    stripe: StripeProviderData;
    resend: ResendProviderData;
    duffel: DuffelProviderData;
    mystifly: MystiflyProviderData;
    liteapi: LiteApiProviderData;
}

export interface ApiLogRow {
    id: string;
    provider: string;
    endpoint: string;
    method: string;
    request_params: Record<string, unknown> | null;
    response_status: number | null;
    response_summary: Record<string, unknown> | null;
    duration_ms: number;
    error_message: string | null;
    user_id: string | null;
    search_id: string | null;
    created_at: string;
}
