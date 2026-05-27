import { createAdminClient } from '@/utils/supabase/admin';
import { Booking } from '@/types/admin';
import { checkRefundability } from './recovery';
import { enrichBookingFinances } from '@/lib/pricing';
import { EXCHANGE_RATES } from '@/lib/currency';

export interface BookingsListParams {
    page?: number;
    pageSize?: number;
    searchTerm?: string;
    status?: string;
    supplier?: string;
    paymentStatus?: string;
    type?: string;
}

export interface PaginatedBookings {
    bookings: Booking[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    stats: {
        totalRevenue: number;
        totalProfit: number;
        totalMarkup: number;
        totalStripeFees: number;
    };
}

export async function getBookingsList(params: BookingsListParams = {}): Promise<PaginatedBookings> {
    const {
        page = 1,
        pageSize = 10,
        searchTerm = '',
        status = 'all',
        supplier = 'all',
        paymentStatus = 'all',
        type = 'all'
    } = params;

    const supabase = createAdminClient();

    // 1. Build queries for each table
    const unifiedQuery = supabase.from('unified_bookings').select('*', { count: 'exact' });
    const legacyHotelQuery = supabase.from('bookings').select('*', { count: 'exact' });
    const legacyFlightQuery = supabase.from('flight_bookings').select('*, booking_sessions(contact)', { count: 'exact' });

    // 2. Apply Type Filter
    if (type !== 'all') {
        if (type === 'flight') {
            legacyHotelQuery.eq('id', 'non-existent'); // effectively disable
            unifiedQuery.eq('type', 'flight');
        } else if (type === 'hotel') {
            legacyFlightQuery.eq('id', 'non-existent'); // effectively disable
            unifiedQuery.eq('type', 'hotel');
        }
    }

    // 3. Apply Status Filter
    if (status !== 'all') {
        unifiedQuery.eq('status', status);
        legacyHotelQuery.eq('status', status);
        // Handle flight status mapping if needed, legacy flight uses 'booked' instead of 'confirmed'
        const flightStatus = status === 'confirmed' ? 'booked' : status;
        legacyFlightQuery.eq('status', flightStatus);
    }

    // 4. Apply Supplier Filter
    if (supplier !== 'all') {
        if (supplier === 'legacy') {
            unifiedQuery.eq('id', 'non-existent');
        } else {
            unifiedQuery.eq('provider', supplier);
            legacyHotelQuery.eq('id', 'non-existent');
            legacyFlightQuery.eq('provider', supplier);
        }
    }

    // Execute queries
    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        unifiedQuery.order('created_at', { ascending: false }),
        legacyHotelQuery.order('created_at', { ascending: false }),
        legacyFlightQuery.order('created_at', { ascending: false })
    ]);

    // Fetch passenger names and tickets for legacy flights
    const flightBookingIds = legacyFlightRes.data?.map(b => b.id) || [];
    const { data: passengers } = flightBookingIds.length > 0
        ? await supabase
            .from('passengers')
            .select('booking_id, first_name, last_name, type, ticket_number')
            .in('booking_id', flightBookingIds)
        : { data: [] };

    const passengerMap = (passengers || []).reduce((acc: Record<string, { name: string; tickets: string[]; list: { firstName: string; lastName: string; type: string; ticketNumber?: string }[] }>, p) => {
        if (!acc[p.booking_id]) {
            acc[p.booking_id] = { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), tickets: [], list: [] };
        }
        acc[p.booking_id].list.push({
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            type: p.type || 'ADT',
            ...(p.ticket_number ? { ticketNumber: p.ticket_number } : {}),
        });
        if (p.ticket_number) {
            acc[p.booking_id].tickets.push(p.ticket_number);
        }
        return acc;
    }, {});

    // 5. Merge and unify
    let allBookings: Booking[] = [
        ...(unifiedRes.data || []).map(item => {
            const meta = item.metadata as any;
            const name = meta?.passengers?.[0]
                ? `${meta.passengers[0].firstName} ${meta.passengers[0].lastName}`
                : meta?.holder
                    ? `${meta.holder.firstName} ${meta.holder.lastName}`
                    : 'Anonymous User';

            const tickets = meta?.tickets || (meta?.passengers?.map((p: any) => p.ticketNumber).filter(Boolean)) || [];
            const pnr = meta?.pnr || item.external_id || '';

            return {
                id: item.id,
                bookingRef: item.external_id || item.id.slice(0, 8).toUpperCase(),
                type: item.type as "flight" | "hotel",
                supplier: item.provider,
                customerName: name.trim() || 'Anonymous User',
                email: meta?.holder?.email || meta?.email || meta?.contact_email || meta?.contactDetails?.email || meta?.contact_details?.email || meta?.customer_email || meta?.passengers?.[0]?.email || '',
                totalAmount: Number(item.total_price),
                supplierCost: Number(item.supplier_cost || 0),
                markupAmount: Number(item.markup_amount || 0),
                profit: Number(item.profit || 0),
                currency: item.currency,
                status: item.status,
                paymentStatus: ['confirmed', 'ticketed', 'booked', 'awaiting_ticket'].includes(item.status) ? 'paid' :
                    item.status === 'refunded' ? 'refunded' :
                        item.status === 'cancelled' ? 'cancelled' : 'unpaid',
                createdAt: item.created_at,
                ticketIds: Array.isArray(tickets) ? tickets : [tickets].filter(Boolean),
                ticketStatus: (item.status === 'ticketed' || tickets.length > 0) ? 'Issued' : 'N/A',
                pnr,
                paymentIntentId: meta?.payment_intent_id || meta?.paymentIntentId || '',
                isRefundable: checkRefundability(item, 'unified_bookings').refundable,
                markup_pct: item.markup_pct,
                metadata: meta
            };
        }),
        ...(legacyHotelRes.data || []).map(item => ({
            id: item.id,
            bookingRef: item.booking_id,
            type: 'hotel' as const,
            supplier: 'legacy',
            customerName: `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim() || 'Anonymous User',
            email: item.holder_email || '',
            totalAmount: Number(item.total_price),
            supplierCost: Number(item.total_price),
            markupAmount: 0,
            profit: 0,
            currency: item.currency,
            status: item.status,
            paymentStatus: item.status === 'confirmed' ? 'paid' :
                item.status === 'refunded' ? 'refunded' :
                    item.status === 'cancelled' ? 'cancelled' : 'unpaid',
            createdAt: item.created_at,
            ticketIds: [],
            ticketStatus: 'N/A',
            pnr: '',
            paymentIntentId: '',
            isRefundable: checkRefundability(item, 'bookings').refundable,
            metadata: {
                holder: {
                    firstName: item.holder_first_name || '',
                    lastName: item.holder_last_name || '',
                    email: item.holder_email || '',
                },
                guests: {
                    adults: item.guests_adults ?? 1,
                    children: item.guests_children ?? 0,
                },
            }
        })),
        ...(legacyFlightRes.data || []).map(item => ({
            id: item.id,
            bookingRef: item.pnr,
            type: 'flight' as const,
            supplier: item.provider,
            customerName: passengerMap[item.id]?.name || 'Anonymous User',
            email: item.booking_sessions?.contact?.email || '',
            totalAmount: Number(item.charged_price || item.total_price),
            supplierCost: Number(item.supplier_cost || item.total_price),
            markupAmount: Number((item.charged_price || item.total_price) - (item.supplier_cost || item.total_price)),
            profit: 0, // Calculated in UI enrichment
            currency: item.currency || 'USD',
            status: item.status === 'booked' ? 'confirmed' : item.status,
            paymentStatus: ['booked', 'ticketed', 'confirmed', 'awaiting_ticket'].includes(item.status) ? 'paid' :
                item.status === 'cancelled' ? 'cancelled' :
                    item.status === 'refunded' ? 'refunded' : 'unpaid',
            createdAt: item.created_at,
            ticketIds: passengerMap[item.id]?.tickets || [],
            ticketStatus: (item.status === 'ticketed' || (passengerMap[item.id]?.tickets?.length > 0)) ? 'Issued' : 'Pending',
            pnr: item.pnr,
            paymentIntentId: item.payment_intent_id || '',
            isRefundable: checkRefundability(item, 'flight_bookings').refundable,
            markup_pct: item.markup_pct,
            metadata: {
                passengers: passengerMap[item.id]?.list || [],
            }
        }))
    ];

    // Apply financial enrichment
    allBookings = allBookings.map(b => enrichBookingFinances(b));

    // 6. Apply Search Filter (Server-side but after merge due to cross-table complexity)
    if (searchTerm) {
        const lowSearch = searchTerm.toLowerCase();
        allBookings = allBookings.filter(b =>
            b.customerName.toLowerCase().includes(lowSearch) ||
            b.bookingRef.toLowerCase().includes(lowSearch) ||
            b.pnr.toLowerCase().includes(lowSearch) ||
            b.email.toLowerCase().includes(lowSearch) ||
            b.paymentIntentId.toLowerCase().includes(lowSearch) ||
            b.supplier.toLowerCase().includes(lowSearch)
        );
    }

    // 7. Apply Payment Filter
    if (paymentStatus !== 'all') {
        allBookings = allBookings.filter(b => b.paymentStatus.toLowerCase() === paymentStatus.toLowerCase());
    }

    // 8. Final Sort, Aggregate Stats, and Paginate
    const total = allBookings.length;
    const sorted = allBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ── Revenue stats: use RPC for the total (avoids 1000-row limit) ─────────
    // The JS-side loop below is only used as a fallback if the RPC fails.
    const phpRate = 1 / EXCHANGE_RATES['PHP'];
    const { data: rpcStats, error: rpcError } = await supabase.rpc('get_revenue_stats', { php_rate: phpRate });

    let stats: { totalRevenue: number; totalProfit: number; totalMarkup: number; totalStripeFees: number };

    if (rpcStats && !rpcError) {
        // ✅ Use RPC — consistent with dashboard, no row-limit risk
        stats = {
            totalRevenue:    rpcStats.totalRevenue,
            totalProfit:     rpcStats.totalProfit,
            totalMarkup:     rpcStats.totalMarkup,
            totalStripeFees: 0, // not tracked in RPC (Stripe fees calculated client-side)
        };
    } else {
        // ⚠️ Fallback: JS-side sum from paginated set (may be incomplete)
        console.warn('[getBookingsList] RPC failed, falling back to JS-side stats:', rpcError?.message);
        stats = sorted.reduce((acc, b) => {
            const isSuccessful = ['confirmed', 'ticketed', 'booked', 'awaiting_ticket'].includes(b.status);
            if (isSuccessful) {
                const rate = b.currency === 'USD' ? phpRate : 1;
                acc.totalRevenue    += b.totalAmount  * rate;
                acc.totalProfit     += b.profit        * rate;
                acc.totalMarkup     += b.markupAmount  * rate;
                acc.totalStripeFees += ((b as any).stripeFee || 0) * rate;
            }
            return acc;
        }, { totalRevenue: 0, totalProfit: 0, totalMarkup: 0, totalStripeFees: 0 });
    }

    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

    return {
        bookings: paginated,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        stats,
    };

}