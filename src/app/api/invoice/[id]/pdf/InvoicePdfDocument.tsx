import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { canonicalBrandName } from '@/lib/brand';

// A receipt is a financial record, so it must name the company the customer actually paid.
// Both the visible brand and the PDF's own title/author metadata were literals, which meant
// a Korean customer's downloaded receipt identified a company they had never transacted with.
const BRAND = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);

// ── Types ──

interface InvoicePdfProps {
    invoiceNumber: string;
    issuedDate: string;
    billedTo: { name: string; email: string };
    isHotel: boolean;
    hotelDetails: {
        propertyName: string;
        roomName: string;
        dates: string;
        nights: number;
        guests: string;
    } | null;
    flightDetails: {
        segments: { airline: string; route: string; date: string }[];
        passengers: { name: string; type: string; ticketNumber: string }[];
    } | null;
    bookingRef: string;
    bookingType: string;
    provider: string;
    formattedTotal: string;
    /** The lead traveller's e-ticket, or null before the airline issues one. */
    ticketNumber: string | null;
    /** The airline that issued the ticket, or the property for a stay. */
    issuingAirline: string | null;
    /** Already-formatted cancellation terms, or null when the booking records none. */
    cancellation: string | null;
    /** Already-formatted voucher discount, or null when none was applied. */
    discount: { label: string; formattedAmount: string } | null;
    /**
     * Fare before tax and everything else, already formatted. Null when the booking's
     * offer recorded no fare, which is every booking taken before Duffel's base_amount
     * was parsed. The second figure is never labelled as tax alone — it carries any
     * platform fee too (ADR-0042).
     */
    breakdown: { formattedFare: string; formattedTaxesAndFees: string } | null;
}

// ── Styles ──

const colors = {
    indigo: '#4f46e5',
    darkText: '#1e293b',
    mediumText: '#475569',
    lightText: '#94a3b8',
    faintText: '#cbd5e1',
    border: '#e2e8f0',
    bgLight: '#f8fafc',
    emerald: '#059669',
    white: '#ffffff',
};

const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        backgroundColor: colors.white,
        paddingHorizontal: 48,
        paddingVertical: 40,
        fontSize: 10,
        color: colors.mediumText,
    },

    // ── Header ──
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: colors.indigo, letterSpacing: -0.5 },
    tagline: { fontSize: 8, color: colors.lightText, marginTop: 2 },
    receiptTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: colors.darkText, textAlign: 'right' as const },
    receiptMeta: { fontSize: 8, color: colors.lightText, textAlign: 'right' as const, marginTop: 2 },

    // ── Section helpers ──
    section: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    sectionLabel: {
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        color: colors.lightText,
        textTransform: 'uppercase' as const,
        letterSpacing: 1.5,
        marginBottom: 6,
    },

    // ── Table ──
    tableHeaderRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingBottom: 6,
        marginBottom: 4,
    },
    tableHeaderCell: {
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        color: colors.lightText,
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: '#f1f5f9',
    },
    tableCell: { fontSize: 9, color: colors.mediumText },
    tableCellBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.darkText },

    // ── Hotel description ──
    hotelPropName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    hotelSub: { fontSize: 9, color: colors.mediumText, marginTop: 2 },

    // ── Passengers ──
    passengerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    passengerName: { fontSize: 9, color: colors.mediumText },
    passengerType: { fontSize: 8, color: colors.lightText },
    ticketLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.emerald },

    // ── Label / value rows ──
    totalNote: { fontSize: 8, color: colors.lightText, marginTop: 2 },
    discountValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.emerald },
    identityBlock: { marginBottom: 16 },
    identityRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
    identityLabel: { fontSize: 9, color: colors.indigo, fontFamily: 'Helvetica-Bold' },
    identityDivider: { fontSize: 9, color: colors.faintText },
    identityValue: { fontSize: 10, color: colors.darkText },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 5,
    },
    detailLabel: { fontSize: 9, color: colors.mediumText },
    detailValue: { fontSize: 9, color: colors.darkText, textAlign: 'right' },
    detailValueBold: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.darkText, textAlign: 'right' },


    // ── Footer ──
    footer: {
        marginTop: 16,
        backgroundColor: colors.bgLight,
        borderRadius: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    footerText: { fontSize: 8, color: colors.lightText, textAlign: 'center' as const },
    footerEmail: { fontSize: 8, color: colors.indigo },
});

// ── Component ──

export function InvoicePdfDocument(props: InvoicePdfProps) {
    const {
        invoiceNumber, issuedDate, billedTo, isHotel,
        hotelDetails, flightDetails, bookingRef,
        bookingType, provider, formattedTotal,
        cancellation, discount, ticketNumber, issuingAirline, breakdown,
    } = props;

    const showFlight = !!flightDetails;
    const showHotel = !!hotelDetails;

    return (
        <Document title={`${BRAND} Receipt ${invoiceNumber}`} author={BRAND}>
            <Page size="A4" style={s.page}>

                {/* ── Header ── */}
                <View style={s.headerRow}>
                    <View>
                        <Text style={s.brand}>{BRAND}</Text>
                        <Text style={s.tagline}>Your Travel Companion</Text>
                    </View>
                    <View>
                        <Text style={s.receiptTitle}>E-RECEIPT</Text>
                        <Text style={s.receiptMeta}>{invoiceNumber}</Text>
                        <Text style={s.receiptMeta}>Issued: {issuedDate}</Text>
                    </View>
                </View>

                {/* ── Who this is for ──
                    No contact number: this document is reached by a forwardable UUID, and a
                    phone beside a name, reference and ticket number is what an airline asks
                    for to verify a caller. See ADR-0027. */}
                <View style={s.identityBlock}>
                    <View style={s.identityRow}>
                        <Text style={s.identityLabel}>{isHotel ? 'GUEST' : 'PASSENGER'}</Text>
                        <Text style={s.identityDivider}>|</Text>
                        <Text style={s.identityValue}>{(billedTo.name || 'Guest').toUpperCase()}</Text>
                    </View>
                    {ticketNumber ? (
                        <View style={s.identityRow}>
                            <Text style={s.identityLabel}>TICKET NUMBER</Text>
                            <Text style={s.identityDivider}>|</Text>
                            <Text style={s.identityValue}>{ticketNumber}</Text>
                        </View>
                    ) : null}
                </View>

                {/* ── Your details ── */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>Your details</Text>
                    <View style={s.detailRow}>
                        <Text style={s.detailLabel}>{isHotel ? 'Guest Name' : 'Passenger Name'}</Text>
                        <Text style={s.detailValue}>{billedTo.name || 'Guest'}</Text>
                    </View>
                    {billedTo.email ? (
                        <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Email Address</Text>
                            <Text style={s.detailValue}>{billedTo.email}</Text>
                        </View>
                    ) : null}
                </View>

                {/* ── Hotel Details (If present) ── */}
                {showHotel && hotelDetails && (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>Stay</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.hotelPropName}>{hotelDetails.propertyName}</Text>
                                {hotelDetails.roomName ? <Text style={s.hotelSub}>{hotelDetails.roomName}</Text> : null}
                                <Text style={s.hotelSub}>{hotelDetails.dates} · {hotelDetails.nights} night{hotelDetails.nights !== 1 ? 's' : ''}</Text>
                                <Text style={s.hotelSub}>{hotelDetails.guests}</Text>
                            </View>
                            {!showFlight && (
                                <Text style={[s.tableCellBold, { fontSize: 11 }]}>{formattedTotal}</Text>
                            )}
                        </View>
                    </View>
                )}

                {/* ── Flight Details (If present) ── */}
                {showFlight && flightDetails && (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>Itinerary</Text>

                        {/* Segment table */}
                        <View style={s.tableHeaderRow}>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Flight</Text>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Route</Text>
                            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Date</Text>
                        </View>
                        {flightDetails.segments.map((seg, i) => (
                            <View key={i} style={s.tableRow}>
                                <Text style={[s.tableCellBold, { width: '35%' }]}>{seg.airline}</Text>
                                <Text style={[s.tableCell, { width: '35%' }]}>{seg.route}</Text>
                                <Text style={[s.tableCell, { width: '30%' }]}>{seg.date}</Text>
                            </View>
                        ))}

                        {/* Passengers */}
                        {flightDetails.passengers.length > 0 && (
                            <View style={{ marginTop: 14 }}>
                                <Text style={s.sectionLabel}>Passengers</Text>
                                {flightDetails.passengers.map((p, i) => (
                                    <View key={i} style={s.passengerRow}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            <Text style={s.passengerName}>{p.name}</Text>
                                            <Text style={s.passengerType}>({p.type})</Text>
                                        </View>
                                        {p.ticketNumber ? (
                                            <Text style={s.ticketLabel}>E-TKT: {p.ticketNumber}</Text>
                                        ) : null}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* ── Flight / stay details ──
                    The design also draws Fare, Taxes, Restriction Endorsements and Fare
                    Calculation. None is rendered: no tax figure is recorded anywhere
                    (ADR-0042), and the last two come from a Mystifly ticket-display call
                    that cannot run while Duffel is the only live provider. A blank label
                    or a zero would read as a fact, so the rows wait for real values. */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{isHotel ? 'Stay details' : 'Flight details'}</Text>

                    <View style={s.detailRow}>
                        <Text style={s.detailLabel}>{isHotel ? 'Booking Reference' : 'PNR'}</Text>
                        <Text style={s.detailValue}>{bookingRef}</Text>
                    </View>

                    {ticketNumber ? (
                        <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Ticket number</Text>
                            <Text style={s.detailValue}>{ticketNumber}</Text>
                        </View>
                    ) : null}

                    <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Form of payment</Text>
                        <Text style={s.detailValue}>Stripe (Card)</Text>
                    </View>

                    {/* Fare and the rest, derived so the rows account for the whole charge.
                        The second is never "Tax" alone — it carries any platform fee too. */}
                    {breakdown && (
                        <>
                            <View style={s.detailRow}>
                                <Text style={s.detailLabel}>Fare</Text>
                                <Text style={s.detailValue}>{breakdown.formattedFare}</Text>
                            </View>
                            <View style={s.detailRow}>
                                <Text style={s.detailLabel}>Taxes and fees</Text>
                                <Text style={s.detailValue}>{breakdown.formattedTaxesAndFees}</Text>
                            </View>
                        </>
                    )}

                    {/* Sits where a reader expects a deduction: immediately above the total. */}
                    {discount && (
                        <View style={s.detailRow}>
                            <Text style={s.detailLabel}>{discount.label}</Text>
                            <Text style={s.discountValue}>−{discount.formattedAmount}</Text>
                        </View>
                    )}

                    <View style={s.detailRow}>
                        <View>
                            <Text style={s.detailLabel}>Total Amount</Text>
                            {/* Only worth saying when the parts are not shown above. */}
                            {breakdown ? null : <Text style={s.totalNote}>Includes all taxes and fees</Text>}
                        </View>
                        <Text style={s.detailValueBold}>{formattedTotal}</Text>
                    </View>

                    {issuingAirline ? (
                        <View style={s.detailRow}>
                            <Text style={s.detailLabel}>{isHotel ? 'Property' : 'Issuing Airline'}</Text>
                            <Text style={s.detailValue}>{issuingAirline}</Text>
                        </View>
                    ) : null}

                    {/* Absent terms say nothing. A booking that never recorded its rules
                        must not read as non-refundable. */}
                    {cancellation && (
                        <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Cancellation</Text>
                            <Text style={s.detailValue}>{cancellation}</Text>
                        </View>
                    )}

                    <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Type</Text>
                        <Text style={s.detailValue}>{bookingType}</Text>
                    </View>
                    <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Provider</Text>
                        <Text style={s.detailValue}>{provider}</Text>
                    </View>
                </View>

                {/* The total lives inside the details block above, where the design puts
                    it. There is no separate total band and no breakdown — see ADR-0042. */}

                {/* ── Footer ── */}
                <View style={s.footer}>
                    <Text style={s.footerText}>
                        Thank you for booking with {BRAND}. For support, contact{' '}
                        <Text style={s.footerEmail}>crm@myfarebox.com</Text>
                    </Text>
                    {/* No issuing entity is named here on purpose. This line used to read
                        "{BRAND} is a trading name of CheapestGo Travel Services", which
                        nobody verified and which names a company appearing nowhere else in
                        this codebase; the site footer and the TravelgateX contract both say
                        FORHU Inc. An unverified legal claim on a document finance teams file
                        is worse than no claim, so it was removed rather than corrected on a
                        guess. Restore a real entity — with its registered address and tax
                        registration number — once someone confirms what is registered, here
                        and on airanggo.com. Until then this is not a tax invoice. ADR-0042. */}
                </View>

            </Page>
        </Document>
    );
}
