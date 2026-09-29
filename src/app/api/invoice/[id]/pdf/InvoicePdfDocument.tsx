import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { canonicalBrandName } from '@/lib/brand';

// A receipt is a financial record, so it must name the company the customer actually paid.
// Both the visible brand and the PDF's own title/author metadata were literals, which meant
// a Korean customer's downloaded receipt identified a company they had never transacted with.
const BRAND = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);

// ── Types ──

/**
 * One itinerary card. Pre-formatted by the route handler (from itinerary-view.ts, the
 * same module the web page uses) rather than computed here — react-pdf renders on the
 * request path, so date/duration arithmetic belongs in one shared, unit-tested place,
 * not duplicated inside a page-layout component. See ADR-0042 on the cost of the two
 * renderers computing a fact differently.
 */
interface FlightSliceProps {
    label: string;
    flightNumber: string;
    cabinClass: string;
    origin: string;
    destination: string;
    departureTime: string;
    departureDate: string;
    arrivalTime: string;
    arrivalDate: string;
    arrivalDayOffset: number;
    durationLabel: string;
    stopsLabel: string;
}

interface InvoicePdfProps {
    invoiceNumber: string;
    issuedDate: string;
    billedTo: { name: string; email: string };
    isHotel: boolean;
    /** Null once the booking is cancelled, refunded, or failed — see route.ts. */
    paidBadge: string | null;
    reference: { label: string; value: string };
    /** The reference band's middle column: route/stay at a glance. Null only if a
     *  flight booking recorded no segments at all. */
    tripSummary: { title: string; subtitle: string } | null;
    hotelDetails: {
        propertyName: string;
        roomName: string;
        dates: string;
        nights: number;
        guests: string;
    } | null;
    flightDetails: {
        slices: FlightSliceProps[];
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

// The brand's actual primary is blue-600 (#2563eb, see globals.css's --color-primary /
// --color-blue-600) — this file used a generic Tailwind-indigo hex instead, so the PDF
// and the web receipt printed two different "brand" colors for the same document.
const colors = {
    indigo: '#2563eb',
    indigoBg: '#eff6ff',
    darkText: '#1e293b',
    mediumText: '#475569',
    lightText: '#94a3b8',
    faintText: '#cbd5e1',
    border: '#e2e8f0',
    bgLight: '#f8fafc',
    emerald: '#059669',
    emeraldBg: '#ecfdf5',
    rose: '#e11d48',
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
    receiptTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    receiptTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: colors.darkText, textAlign: 'right' as const },
    receiptMeta: { fontSize: 8, color: colors.lightText, textAlign: 'right' as const, marginTop: 2 },
    paidBadge: {
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        color: colors.emerald,
        backgroundColor: colors.emeraldBg,
        borderRadius: 8,
        paddingVertical: 3,
        paddingHorizontal: 7,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
    },

    // ── Reference band ──
    referenceBand: {
        flexDirection: 'row',
        backgroundColor: colors.indigoBg,
        borderRadius: 8,
        marginTop: 16,
        marginBottom: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    referenceCol: { flex: 1 },
    referenceColMiddle: { flex: 1.6, borderLeftWidth: 1, borderLeftColor: '#c7d2fe', paddingLeft: 14, marginLeft: 14 },
    referenceLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.indigo, textTransform: 'uppercase' as const, letterSpacing: 1 },
    referenceValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.darkText, marginTop: 3 },
    referenceTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.darkText, marginTop: 3 },
    referenceSubtitle: { fontSize: 8, color: colors.mediumText, marginTop: 2 },
    referenceTotal: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.darkText, marginTop: 3, textAlign: 'right' as const },

    // ── Itinerary cards ──
    sliceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 6,
    },
    sliceLegCol: { width: '20%' },
    sliceTimeCol: { width: '30%' },
    sliceMidCol: { width: '20%', alignItems: 'center' },
    sliceLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.indigo, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    sliceFlightNumber: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.darkText, marginTop: 2 },
    sliceCabin: { fontSize: 8, color: colors.mediumText, marginTop: 1, textTransform: 'capitalize' as const },
    sliceTime: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    sliceDayOffset: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.rose },
    sliceAirport: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.mediumText, marginTop: 1 },
    sliceDate: { fontSize: 7, color: colors.lightText, marginTop: 1 },
    sliceDuration: { fontSize: 7, color: colors.lightText },
    sliceDivider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: 3 },
    sliceStops: { fontSize: 7, color: colors.lightText },

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
    twoCol: { flexDirection: 'row', gap: 24 },
    twoColItem: { flex: 1 },

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
        invoiceNumber, issuedDate, billedTo, isHotel, paidBadge, reference, tripSummary,
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
                        <View style={s.receiptTitleRow}>
                            {paidBadge ? <Text style={s.paidBadge}>{paidBadge}</Text> : null}
                            <Text style={s.receiptTitle}>E-RECEIPT</Text>
                        </View>
                        <Text style={s.receiptMeta}>{invoiceNumber}</Text>
                        <Text style={s.receiptMeta}>Issued: {issuedDate}</Text>
                    </View>
                </View>

                {/* ── Reference band ──
                    Booking reference, trip/stay at a glance, and total paid — everything a
                    traveller or an expense desk needs before reading the detail sections. */}
                <View style={s.referenceBand}>
                    <View style={s.referenceCol}>
                        <Text style={s.referenceLabel}>{reference.label}</Text>
                        <Text style={s.referenceValue}>{reference.value || '—'}</Text>
                    </View>
                    {tripSummary && (
                        <View style={s.referenceColMiddle}>
                            <Text style={s.referenceLabel}>TRIP</Text>
                            <Text style={s.referenceTitle}>{tripSummary.title}</Text>
                            <Text style={s.referenceSubtitle}>{tripSummary.subtitle}</Text>
                        </View>
                    )}
                    <View style={[s.referenceCol, { alignItems: 'flex-end' }]}>
                        <Text style={s.referenceLabel}>TOTAL PAID</Text>
                        <Text style={s.referenceTotal}>{formattedTotal}</Text>
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

                {/* ── Flight Details (If present) ──
                    One card per slice, spanning its first departure to its last arrival —
                    a connection's layover counts toward duration and stop count exactly
                    once. Grouping and arithmetic live in itinerary-view.ts, shared with the
                    web page (ADR-0042); this component only lays out what it is given. */}
                {showFlight && flightDetails && (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>Itinerary</Text>

                        {flightDetails.slices.map((slice, i) => (
                            <View key={i} style={s.sliceCard}>
                                <View style={s.sliceLegCol}>
                                    <Text style={s.sliceLabel}>{slice.label}</Text>
                                    <Text style={s.sliceFlightNumber}>{slice.flightNumber}</Text>
                                    <Text style={s.sliceCabin}>{slice.cabinClass}</Text>
                                </View>
                                <View style={s.sliceTimeCol}>
                                    <Text style={s.sliceTime}>{slice.departureTime}</Text>
                                    <Text style={s.sliceAirport}>{slice.origin}</Text>
                                    <Text style={s.sliceDate}>{slice.departureDate}</Text>
                                </View>
                                <View style={s.sliceMidCol}>
                                    <Text style={s.sliceDuration}>{slice.durationLabel}</Text>
                                    <View style={s.sliceDivider} />
                                    <Text style={s.sliceStops}>{slice.stopsLabel}</Text>
                                </View>
                                <View style={[s.sliceTimeCol, { alignItems: 'flex-end' }]}>
                                    <Text style={s.sliceTime}>
                                        {slice.arrivalTime}
                                        {slice.arrivalDayOffset > 0 ? <Text style={s.sliceDayOffset}> +{slice.arrivalDayOffset}</Text> : null}
                                    </Text>
                                    <Text style={s.sliceAirport}>{slice.destination}</Text>
                                    <Text style={s.sliceDate}>{slice.arrivalDate}</Text>
                                </View>
                            </View>
                        ))}

                        {/* Passengers */}
                        {flightDetails.passengers.length > 0 && (
                            <View style={{ marginTop: 10 }}>
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

                {/* ── Booking and payment, split into the two columns the design draws.
                    The design also draws Fare, Taxes, Restriction Endorsements and Fare
                    Calculation. Restriction Endorsements and Fare Calculation are never
                    rendered — they come from a Mystifly ticket-display call that cannot
                    run while Duffel is the only live provider — and Fare/Taxes render only
                    when a real per-offer fare was recorded (ADR-0042). A blank label or a
                    zero would read as a fact, so the rows wait for real values. */}
                <View style={s.section}>
                    <View style={s.twoCol}>
                        <View style={s.twoColItem}>
                            <Text style={s.sectionLabel}>Booking</Text>

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

                            {issuingAirline ? (
                                <View style={s.detailRow}>
                                    <Text style={s.detailLabel}>{isHotel ? 'Property' : 'Issuing Airline'}</Text>
                                    <Text style={s.detailValue}>{issuingAirline}</Text>
                                </View>
                            ) : null}

                            {/* Absent terms say nothing. A booking that never recorded its
                                rules must not read as non-refundable. */}
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

                        <View style={s.twoColItem}>
                            <Text style={s.sectionLabel}>Payment</Text>

                            {/* Fare and the rest, derived so the rows account for the whole
                                charge. The second is never "Tax" alone — it carries any
                                platform fee too. */}
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

                            {/* Sits where a reader expects a deduction: immediately above
                                the total. */}
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

                            <View style={s.detailRow}>
                                <Text style={s.detailLabel}>Form of payment</Text>
                                <Text style={s.detailValue}>Stripe (Card)</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Footer ── */}
                <View style={s.footer}>
                    <Text style={s.footerText}>
                        Thank you for booking with {BRAND}. For support, contact{' '}
                        <Text style={s.footerEmail}>crm@myfarebox.com</Text>
                    </Text>
                    {/* No issuing entity is named here on purpose. The line used to name a
                        company appearing nowhere else in this codebase; the site footer and
                        the TravelgateX contract both say FORHU Inc. An unverified legal
                        claim on a document finance teams file is worse than no claim, so it
                        was removed rather than corrected on a guess.

                        The other side of this merge restored it as "a trading name of FORHU
                        Inc.". It is kept out because the branch this merged with carries a
                        test forbidding any such line — not only the wrong one — so the two
                        cannot both stand. Restore a real entity, with its registered address
                        and tax registration number, and relax that test in the same change.
                        Until then this is a receipt, not a tax invoice. */}
                </View>

            </Page>
        </Document>
    );
}
