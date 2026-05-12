import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, useColorScheme, Dimensions, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Filter, Plane, Clock, ArrowRight, Star } from 'lucide-react-native';
import { searchFlights, type FlightSearchParams } from '../lib/api';
import FlightFilters from '../components/flights/FlightFilters';
import { FilterState } from '@core/components/flights/filters';

const { width } = Dimensions.get('window');

export default function FlightsScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [loading, setLoading] = useState(true);
    const [offers, setOffers] = useState<any[]>([]);
    const [filteredOffers, setFilteredOffers] = useState<any[]>([]);
    const [isFilterVisible, setIsFilterVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const styles = getStyles(isDark);

    useEffect(() => {
        const fetchFlights = async () => {
            setLoading(true);
            setError(null);
            try {
                const searchParams: FlightSearchParams = {
                    origin: params.from as string,
                    destination: params.to as string,
                    departureDate: params.departure as string,
                    returnDate: params.returnDate as string || undefined,
                    adults: parseInt(params.passengers as string || '1'),
                    cabinClass: params.cabin as string || 'economy',
                    tripType: params.tripType as 'one-way' | 'round-trip' || 'one-way'
                };

                const result = await searchFlights(searchParams);
                if (result.success) {
                    setOffers(result.flights || []);
                    setFilteredOffers(result.flights || []);
                } else {
                    setError(result.error || 'Failed to fetch flights');
                }
            } catch (err: any) {
                setError(err.message || 'An unexpected error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchFlights();
    }, [params]);

    const airlines = useMemo(() => {
        const set = new Set<string>();
        offers.forEach(o => {
            const name = o.segments?.[0]?.airline?.name || o.segments?.[0]?.airline?.code || o.provider;
            if (name) set.add(name);
        });
        return Array.from(set).sort();
    }, [offers]);

    const handleFilterChange = (filters: FilterState) => {
        let results = [...offers];

        // Airline filter
        if (filters.selectedAirlines.length > 0) {
            results = results.filter(o => {
                const name = o.segments?.[0]?.airline?.name || o.segments?.[0]?.airline?.code || o.provider;
                return filters.selectedAirlines.includes(name);
            });
        }

        // Stops filter
        if (filters.maxStops !== null) {
            results = results.filter(o => o.totalStops <= filters.maxStops!);
        }

        // Refundable filter
        if (filters.refundableOnly) {
            results = results.filter(o => o.refundable);
        }

        // Sort
        results.sort((a, b) => {
            if (filters.sortBy === 'price') return a.price.total - b.price.total;
            if (filters.sortBy === 'duration') return a.totalDuration - b.totalDuration;
            if (filters.sortBy === 'departure') return (a.segments?.[0]?.departure?.time || '').localeCompare(b.segments?.[0]?.departure?.time || '');
            return 0;
        });

        setFilteredOffers(results);
    };

    const formatDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    const formatTime = (timeStr: string) => {
        if (!timeStr) return '';
        const d = new Date(timeStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={isDark ? '#ffffff' : '#0f172a'} />
                </Pressable>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>{params.from} → {params.to}</Text>
                    <Text style={styles.headerSubtitle}>{params.departure} • {params.passengers} Guest{params.passengers !== '1' ? 's' : ''}</Text>
                </View>
                <Pressable onPress={() => setIsFilterVisible(true)} style={styles.filterButton}>
                    <Filter size={20} color={isDark ? '#38bdf8' : '#2563eb'} />
                    {filteredOffers.length !== offers.length && <View style={styles.filterDot} />}
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text style={styles.loadingText}>Finding best flights...</Text>
                </View>
            ) : error ? (
                <View style={styles.centerContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable style={styles.retryButton} onPress={() => router.back()}>
                        <Text style={styles.retryText}>Go Back</Text>
                    </Pressable>
                </View>
            ) : (
                <ScrollView style={styles.resultsList} contentContainerStyle={styles.resultsContent}>
                    <Text style={styles.resultsCount}>{filteredOffers.length} flights found</Text>
                    
                    {filteredOffers.map((offer) => (
                        <View key={offer.offerId} style={styles.flightCard}>
                            <View style={styles.airlineRow}>
                                <View style={styles.airlineInfo}>
                                    <View style={styles.airlineLogoPlaceholder}>
                                        <Plane size={14} color="#64748b" />
                                    </View>
                                    <Text style={styles.airlineName}>
                                        {offer.segments?.[0]?.airline?.name || offer.provider}
                                    </Text>
                                </View>
                                <Text style={styles.priceText}>
                                    {offer.price.currency} {Math.round(offer.price.total).toLocaleString()}
                                </Text>
                            </View>

                            <View style={styles.itineraryContainer}>
                                <View style={styles.timeColumn}>
                                    <Text style={styles.timeText}>{formatTime(offer.segments?.[0]?.departure?.time)}</Text>
                                    <Text style={styles.iataText}>{offer.segments?.[0]?.origin?.iata || params.from}</Text>
                                </View>
                                
                                <View style={styles.durationColumn}>
                                    <Text style={styles.durationText}>{formatDuration(offer.totalDuration)}</Text>
                                    <View style={styles.lineRow}>
                                        <View style={styles.line} />
                                        <View style={styles.planeIconContainer}>
                                            <Plane size={12} color="#94a3b8" style={{ transform: [{ rotate: '90deg' }] }} />
                                        </View>
                                        <View style={styles.line} />
                                    </View>
                                    <Text style={styles.stopsText}>
                                        {offer.totalStops === 0 ? 'Non-stop' : `${offer.totalStops} Stop${offer.totalStops > 1 ? 's' : ''}`}
                                    </Text>
                                </View>

                                <View style={[styles.timeColumn, { alignItems: 'flex-end' }]}>
                                    <Text style={styles.timeText}>
                                        {formatTime(offer.segments?.[offer.segments.length - 1]?.arrival?.time)}
                                    </Text>
                                    <Text style={styles.iataText}>
                                        {offer.segments?.[offer.segments.length - 1]?.destination?.iata || params.to}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.cardFooter}>
                                <View style={styles.badgeRow}>
                                    {offer.refundable && (
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>Refundable</Text>
                                        </View>
                                    )}
                                    <View style={[styles.badge, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                                        <Text style={[styles.badgeText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                                            {offer.cabinClass}
                                        </Text>
                                    </View>
                                </View>
                                <Pressable style={styles.selectButton}>
                                    <Text style={styles.selectButtonText}>Select</Text>
                                </Pressable>
                            </View>
                        </View>
                    ))}

                    {filteredOffers.length === 0 && (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No flights match your filters</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Filter Modal */}
            {isFilterVisible && (
                <View style={styles.modalOverlay}>
                    <SafeAreaView style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filters</Text>
                            <Pressable onPress={() => setIsFilterVisible(false)} style={styles.closeModalButton}>
                                <Text style={styles.closeModalText}>Done</Text>
                            </Pressable>
                        </View>
                        <FlightFilters airlines={airlines} onFilterChange={handleFilterChange} />
                    </SafeAreaView>
                </View>
            )}
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#020617' : '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    headerSubtitle: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        marginTop: 2,
    },
    filterButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterDot: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
        borderWidth: 1.5,
        borderColor: isDark ? '#0f172a' : '#ffffff',
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: isDark ? '#94a3b8' : '#64748b',
    },
    errorText: {
        fontSize: 16,
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 20,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#2563eb',
        borderRadius: 12,
    },
    retryText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    resultsList: {
        flex: 1,
    },
    resultsContent: {
        padding: 16,
        paddingBottom: 40,
    },
    resultsCount: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#475569' : '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
    },
    flightCard: {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0 : 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    airlineRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    airlineInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    airlineLogoPlaceholder: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    airlineName: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    priceText: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#38bdf8' : '#2563eb',
    },
    itineraryContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    timeColumn: {
        flex: 1,
    },
    timeText: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    iataText: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        marginTop: 2,
    },
    durationColumn: {
        flex: 1.5,
        alignItems: 'center',
    },
    durationText: {
        fontSize: 12,
        color: isDark ? '#64748b' : '#94a3b8',
        marginBottom: 4,
    },
    lineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        width: '100%',
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: isDark ? '#334155' : '#e2e8f0',
    },
    planeIconContainer: {
        transform: [{ rotate: '90deg' }],
    },
    stopsText: {
        fontSize: 10,
        fontWeight: '600',
        color: isDark ? '#475569' : '#94a3b8',
        marginTop: 4,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#1e293b' : '#f1f5f9',
    },
    badgeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#2563eb',
    },
    selectButton: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: '#2563eb',
        borderRadius: 10,
    },
    selectButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
    },
    modalContent: {
        flex: 1,
        backgroundColor: isDark ? '#020617' : '#ffffff',
        marginTop: 100,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1e293b' : '#f1f5f9',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    closeModalButton: {
        padding: 4,
    },
    closeModalText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2563eb',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyText: {
        fontSize: 14,
        color: isDark ? '#94a3b8' : '#64748b',
    },
});
