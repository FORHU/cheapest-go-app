import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme, Dimensions, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, List, Map as MapIcon, Search, Filter, Star, MapPin } from 'lucide-react-native';
import { searchHotels } from '../../lib/api';
import MapboxWebView from '../../components/search/MapboxWebView';
import FilterModal from '../../components/search/FilterModal';
import HotelSearchModal from '../../components/search/HotelSearchModal';
import { useSettings } from '../../context/SettingsContext';

const { width, height } = Dimensions.get('window');

const getDisplayPrice = (hotel: any) => {
    // 1. Direct price number
    if (typeof hotel.price === 'number' && hotel.price > 0) {
        return Math.round(hotel.price);
    }
    
    // 2. minPrice (commonly returned by search summaries)
    if (typeof hotel.minPrice === 'number' && hotel.minPrice > 0) {
        return Math.round(hotel.minPrice);
    }
    if (typeof hotel.minPrice === 'string' && !isNaN(parseFloat(hotel.minPrice))) {
        return Math.round(parseFloat(hotel.minPrice));
    }

    // 3. Price object with amount
    if (hotel.price && typeof hotel.price === 'object') {
        const amt = hotel.price.amount || hotel.price.total || hotel.price.value;
        if (typeof amt === 'number') return Math.round(amt);
        if (typeof amt === 'string' && !isNaN(parseFloat(amt))) return Math.round(parseFloat(amt));
    }
    
    // 4. Nested in roomTypes (LiteAPI standard)
    // retailRate.total can be an array [{amount, currency}] or an object {amount}
    if (hotel.roomTypes && hotel.roomTypes.length > 0) {
        const rates = hotel.roomTypes[0]?.rates;
        if (rates && rates.length > 0) {
            const total = rates[0]?.retailRate?.total;
            if (Array.isArray(total) && total.length > 0) {
                const amt = total[0]?.amount;
                if (typeof amt === 'number' && amt > 0) return Math.round(amt);
            }
            if (typeof total === 'object' && total !== null && !Array.isArray(total) && 'amount' in total) {
                const amt = (total as any).amount;
                if (typeof amt === 'number' && amt > 0) return Math.round(amt);
            }
            if (typeof total === 'number' && total > 0) return Math.round(total);

            // Fallback: other price paths
            const price = rates[0]?.price?.amount || 
                          rates[0]?.total_amount ||
                          rates[0]?.price;
            
            if (typeof price === 'number' && price > 0) return Math.round(price);
            if (typeof price === 'string' && !isNaN(parseFloat(price)) && parseFloat(price) > 0) return Math.round(parseFloat(price));
        }
    }
    
    return '???';
};

export default function SearchScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const { currency } = useSettings();
    
    const [loading, setLoading] = useState(true);
    const [rawHotels, setRawHotels] = useState<any[]>([]); // Original data from API
    const [hotels, setHotels] = useState<any[]>([]); // Filtered & sorted data
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
    const [selectedHotel, setSelectedHotel] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const isFetching = useRef(false);
    const cardsScrollRef = useRef<ScrollView>(null);

    // Filter & Sort State
    const [isFilterVisible, setIsFilterVisible] = useState(false);
    const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
    const [filters, setFilters] = useState({
        hotelName: '',
        starRating: [] as number[],
        minRating: 0,
        facilities: [] as number[],
    });
    const [sortBy, setSortBy] = useState<'price_low' | 'price_high' | 'rating' | 'name'>('price_low');

    const styles = getStyles(isDark);

    useEffect(() => {
        const fetchResults = async () => {
            if (isFetching.current) return;
            isFetching.current = true;
            
            setLoading(true);
            setError(null);
            try {

                const results = await searchHotels({
                    destination: params.destination as string,
                    countryCode: params.countryCode as string,
                    placeId: params.placeId as string,
                    checkIn: params.checkIn as string,
                    checkOut: params.checkOut as string,
                    adults: parseInt(params.adults as string || '2'),
                    children: 0,
                    rooms: parseInt(params.rooms as string || '1'),
                    currency: currency.code,
                });
                
                const hotelData = results?.data || [];

                
                // Transform data into a standardized format and filter out low-quality results
                const standardizedData = hotelData
                    .map((h: any) => {
                        const lat = h.latitude || h.details?.latitude || h.details?.location?.latitude || h.lat || h.location?.lat || 0;
                        const lng = h.longitude || h.details?.longitude || h.details?.location?.longitude || h.lng || h.location?.lng || 0;
                        const name = h.name || h.hotelName || h.propertyName;
                        const price = getDisplayPrice(h);
                        
                        // Only return standardized object if we have a name and a valid location
                        if (!name || lat === 0 || lng === 0) return null;

                        return {
                            ...h,
                            name: name,
                            latitude: parseFloat(lat.toString()),
                            longitude: parseFloat(lng.toString()),
                            displayPrice: price,
                            thumbnailUrl: h.thumbnailUrl || h.details?.main_photo || (h.details?.hotel_images_photos?.[0]?.url) || h.image || h.mainPhotoUrl,
                            address: h.address || h.details?.address || h.location || h.city || 'Location unavailable'
                        };
                    })
                    .filter((h: any) => h !== null && h.displayPrice !== '???');

                setRawHotels(standardizedData);
            } catch (error: any) {

                setError(error.message || 'Failed to fetch hotels');
            } finally {
                setLoading(false);
                isFetching.current = false;
            }
        };

        if (params.destination) {
            fetchResults();
        }
    }, [params.destination, params.checkIn, params.checkOut, params.adults, params.rooms, currency.code]);

    const handleHotelSelect = (hotel: any) => {
        setSelectedHotel(hotel);
    };

    // Apply Filters & Sorting
    useEffect(() => {
        let result = [...rawHotels];

        // 1. Property Name
        if (filters.hotelName) {
            result = result.filter(h => h.name.toLowerCase().includes(filters.hotelName.toLowerCase()));
        }

        // 2. Star Rating
        if (filters.starRating.length > 0) {
            result = result.filter(h => filters.starRating.includes(h.starRating));
        }

        // 3. Guest Rating
        if (filters.minRating > 0) {
            result = result.filter(h => (h.reviewRating || h.starRating) >= filters.minRating);
        }

        // 4. Facilities (LiteAPI returns them in facilities array)
        if (filters.facilities.length > 0) {
            result = result.filter(h => 
                filters.facilities.every((fid: number) => 
                    (h.facilities || []).some((f: any) => f.id === fid || f === fid)
                )
            );
        }

        // 5. Sorting
        result.sort((a, b) => {
            const priceA = a.displayPrice === '???' ? 0 : Number(a.displayPrice);
            const priceB = b.displayPrice === '???' ? 0 : Number(b.displayPrice);
            
            if (sortBy === 'price_low') return (priceA || Infinity) - (priceB || Infinity);
            if (sortBy === 'price_high') return priceB - priceA;
            if (sortBy === 'rating') return (b.reviewRating || b.starRating || 0) - (a.reviewRating || a.starRating || 0);
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            return 0;
        });

        setHotels(result);
        if (result.length > 0 && (!selectedHotel || !result.find(h => h.hotelId === selectedHotel.hotelId))) {
            setSelectedHotel(result[0]);
        }
    }, [rawHotels, filters, sortBy]);

    // Sync scroll when selected hotel changes from map
    useEffect(() => {
        if (selectedHotel && viewMode === 'map' && cardsScrollRef.current) {
            const index = hotels.findIndex(h => h.hotelId === selectedHotel.hotelId);
            if (index !== -1) {
                cardsScrollRef.current.scrollTo({
                    x: index * 292, // 280 (card width) + 12 (gap)
                    animated: true
                });
            }
        }
    }, [selectedHotel, viewMode]);

    const handleApplyFilters = (newFilters: any) => {
        setFilters(newFilters);
    };

    const navigateToHotel = (hotel: any) => {
        router.push({
            pathname: `/hotel/${hotel.hotelId}`,
            params: {
                id: hotel.hotelId,
                checkIn: params.checkIn,
                checkOut: params.checkOut,
                adults: params.adults,
                rooms: params.rooms,
                currency: currency.code
            }
        });
    };

    const activeFilterCount = (filters.starRating.length > 0 ? 1 : 0) + 
                             (filters.facilities.length > 0 ? 1 : 0) + 
                             (filters.minRating > 0 ? 1 : 0) + 
                             (filters.hotelName ? 1 : 0);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={isDark ? '#ffffff' : '#0f172a'} />
                </Pressable>
                <Pressable 
                    style={styles.searchPill} 
                    onPress={() => setIsSearchModalVisible(true)}
                >
                    <Search size={16} color="#2563eb" />
                    <View style={styles.searchInfo}>
                        <Text style={styles.destinationText} numberOfLines={1}>{params.destination}</Text>
                        <Text style={styles.dateText}>{params.checkIn} - {params.checkOut} • {params.adults} guests</Text>
                    </View>
                </Pressable>
                <Pressable style={styles.filterBtn} onPress={() => setIsFilterVisible(true)}>
                    <Filter size={20} color={isDark ? '#ffffff' : '#0f172a'} />
                    {activeFilterCount > 0 && (
                        <View style={styles.filterBadge}>
                            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={styles.loadingText}>Finding the best deals...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>Oops!</Text>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
                            <Text style={styles.retryBtnText}>Try different search</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        {/* Sub-header / Sort & View Toggle */}
                        <View style={styles.subHeader}>
                            <View style={styles.resultsCount}>
                                <Text style={styles.resultsCountText}>{hotels.length} hotels found</Text>
                            </View>
                            <View style={styles.actions}>
                                <Pressable style={styles.sortToggle} onPress={() => {
                                    const next: Array<'price_low' | 'price_high' | 'rating' | 'name'> = ['price_low', 'price_high', 'rating', 'name'];
                                    const nextIdx = (next.indexOf(sortBy) + 1) % next.length;
                                    setSortBy(next[nextIdx]);
                                }}>
                                    <List size={16} color="#2563eb" />
                                    <Text style={styles.sortText}>
                                        {sortBy === 'price_low' ? 'Price ↑' : 
                                         sortBy === 'price_high' ? 'Price ↓' :
                                         sortBy === 'rating' ? 'Rating' : 'Name'}
                                    </Text>
                                </Pressable>
                                <Pressable 
                                    style={styles.viewToggle} 
                                    onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                                >
                                    {viewMode === 'map' ? (
                                        <><List size={18} color="white" /><Text style={styles.viewToggleText}>List</Text></>
                                    ) : (
                                        <><MapIcon size={18} color="white" /><Text style={styles.viewToggleText}>Map</Text></>
                                    )}
                                </Pressable>
                            </View>
                        </View>

                        {viewMode === 'map' ? (
                            <View style={styles.mapContainer}>
                                <MapboxWebView
                                    hotels={hotels}
                                    selectedHotelId={selectedHotel?.hotelId}
                                    onHotelSelect={(h) => {

                                        handleHotelSelect(h);
                                    }}
                                    isDark={isDark}
                                    center={hotels[0] ? [hotels[0].longitude, hotels[0].latitude] : undefined}
                                    currencySymbol={currency.symbol}
                                />
                                
                                {/* Floating Hotel Cards */}
                                {hotels.length > 0 && (
                                    <View style={styles.floatingCards}>
                                        <ScrollView 
                                            ref={cardsScrollRef}
                                            horizontal 
                                            showsHorizontalScrollIndicator={false} 
                                            contentContainerStyle={styles.cardsScroll}
                                            snapToInterval={292}
                                            decelerationRate="fast"
                                        >
                                            {hotels.map((hotel) => (
                                                <Pressable 
                                                    key={hotel.hotelId} 
                                                    style={[styles.hotelCard, selectedHotel?.hotelId === hotel.hotelId && styles.hotelCardSelected]}
                                                    onPress={() => handleHotelSelect(hotel)}
                                                >
                                                    <Pressable onPress={() => navigateToHotel(hotel)}>
                                                        <Image 
                                                            source={{ uri: hotel.thumbnailUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80' }} 
                                                            style={styles.hotelCardImage} 
                                                        />
                                                    </Pressable>
                                                    <View style={styles.hotelCardContent}>
                                                        <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                                                        <View style={styles.hotelRatingRow}>
                                                            <Star size={12} color="#fbbf24" fill="#fbbf24" />
                                                            <Text style={styles.hotelRatingText}>{hotel.reviewRating || hotel.starRating || 'New'}</Text>
                                                        </View>
                                                        <View style={styles.hotelPriceRow}>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.hotelPrice}>{currency.symbol}{hotel.displayPrice}</Text>
                                                                <Text style={styles.hotelPerNight}>/night</Text>
                                                            </View>
                                                            <Pressable 
                                                                style={styles.cardViewBtn}
                                                                onPress={() => navigateToHotel(hotel)}
                                                            >
                                                                <Text style={styles.cardViewBtnText}>View</Text>
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                        ) : (
                            <ScrollView style={styles.listView} contentContainerStyle={styles.listContent}>
                                {hotels.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyText}>No hotels found for this search.</Text>
                                    </View>
                                ) : (
                                    hotels.map((hotel) => (
                                        <Pressable key={hotel.hotelId} style={styles.listCard} onPress={() => navigateToHotel(hotel)}>
                                            <Image 
                                                source={{ uri: hotel.thumbnailUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=500&q=80' }} 
                                                style={styles.listImage} 
                                            />
                                            <View style={styles.listDetails}>
                                                <View style={styles.listHeaderRow}>
                                                    <Text style={styles.listHotelName} numberOfLines={1}>{hotel.name}</Text>
                                                    <View style={styles.listRatingBadge}>
                                                        <Star size={12} color="white" fill="white" />
                                                        <Text style={styles.listRatingText}>{hotel.reviewRating || hotel.starRating || 'N/A'}</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.listLocationRow}>
                                                    <MapPin size={12} color={isDark ? '#64748b' : '#94a3b8'} />
                                                    <Text style={styles.listLocationText} numberOfLines={1}>{hotel.address || hotel.city || 'Location unavailable'}</Text>
                                                </View>
                                                <View style={styles.listFooterRow}>
                                                    <View style={styles.listPriceCol}>
                                                        <Text style={styles.listPriceText}>{currency.symbol}{hotel.displayPrice}</Text>
                                                        <Text style={styles.listPerNightText}>total per night</Text>
                                                    </View>
                                                    <View style={styles.viewBtn}>
                                                        <Text style={styles.viewBtnText}>View</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </Pressable>
                                    ))
                                )}
                            </ScrollView>
                        )}
                    </>
                )}
            </View>

            <FilterModal 
                visible={isFilterVisible} 
                onClose={() => setIsFilterVisible(false)} 
                filters={filters}
                onApply={handleApplyFilters}
            />

            <HotelSearchModal 
                visible={isSearchModalVisible}
                onClose={() => setIsSearchModalVisible(false)}
            />

        </View>
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
        paddingTop: 24,
        paddingBottom: 2,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
        zIndex: 10,
    },
    backBtn: {
        padding: 4,
    },
    searchPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 4,
        marginRight: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#e2e8f0',
    },
    searchInfo: {
        flex: 1,
    },
    destinationText: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    dateText: {
        fontSize: 11,
        color: isDark ? '#94a3b8' : '#64748b',
    },
    filterBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    filterBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#2563eb',
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: isDark ? '#020617' : '#ffffff',
    },
    filterBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    subHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: isDark ? '#020617' : '#f8fafc',
    },
    resultsCount: {
        flex: 1,
    },
    resultsCountText: {
        fontSize: 13,
        fontWeight: '600',
        color: isDark ? '#94a3b8' : '#64748b',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    sortToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    sortText: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#e2e8f0' : '#0f172a',
    },
    viewToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563eb',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    viewToggleText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
    content: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: isDark ? '#64748b' : '#94a3b8',
        fontWeight: '500',
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    errorTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 8,
    },
    errorText: {
        fontSize: 16,
        color: isDark ? '#64748b' : '#94a3b8',
        textAlign: 'center',
        marginBottom: 24,
    },
    retryBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#2563eb',
        borderRadius: 12,
    },
    retryBtnText: {
        color: 'white',
        fontWeight: '600',
    },
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    markerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerPriceContainer: {
        backgroundColor: 'white',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    markerPriceText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0f172a',
    },
    markerPriceTextSelected: {
        color: 'white',
    },
    markerSelected: {
        zIndex: 10,
    },
    markerPriceContainerSelected: {
        backgroundColor: '#2563eb',
        borderColor: '#1d4ed8',
    },
    markerArrow: {
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderTopWidth: 6,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'white',
        marginTop: -1,
    },
    markerArrowSelected: {
        borderTopColor: '#2563eb',
    },
    floatingCards: {
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        zIndex: 20,
    },
    cardsScroll: {
        paddingHorizontal: 16,
        gap: 12,
    },
    hotelCard: {
        width: 280,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        flexDirection: 'row',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    hotelCardSelected: {
        borderColor: '#2563eb',
        borderWidth: 2,
    },
    hotelCardImage: {
        width: 100,
        height: 100,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
    },
    hotelCardContent: {
        flex: 1,
        padding: 12,
        justifyContent: 'center',
    },
    hotelName: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 2,
    },
    hotelRatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
    },
    hotelRatingText: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#e2e8f0' : '#0f172a',
    },
    hotelDistanceText: {
        fontSize: 11,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    hotelPriceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
    },
    hotelPrice: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2563eb',
    },
    hotelPerNight: {
        fontSize: 11,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    listView: {
        flex: 1,
    },
    listContent: {
        padding: 16,
    },
    listCard: {
        marginBottom: 20,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    listImage: {
        height: 200,
        width: '100%',
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
    },
    listDetails: {
        padding: 16,
    },
    listHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    listHotelName: {
        flex: 1,
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginRight: 12,
    },
    listRatingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#2563eb',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    listRatingText: {
        fontSize: 12,
        fontWeight: '700',
        color: 'white',
    },
    listLocationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 16,
    },
    listLocationText: {
        fontSize: 13,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    listFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#1e293b' : '#f1f5f9',
        paddingTop: 12,
    },
    listPriceCol: {
        gap: 0,
    },
    listPriceText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2563eb',
    },
    listPerNightText: {
        fontSize: 11,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    viewBtn: {
        backgroundColor: isDark ? '#1e293b' : '#f8fafc',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#e2e8f0',
    },
    viewBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: isDark ? '#64748b' : '#94a3b8',
        textAlign: 'center',
    },
    toggleBtn: {
        position: 'absolute',
        bottom: 32,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#0f172a',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    toggleBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
    cardViewBtn: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    cardViewBtnText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
});
