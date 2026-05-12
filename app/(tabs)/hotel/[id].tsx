import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Coffee, Heart, HelpCircle, MapPin, Share2, ShieldCheck, Star, Tv, Wifi, Wind } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSettings } from '../../../context/SettingsContext';
import { getHotelDetails, getHotelReviews } from '../../../lib/api';

const { width } = Dimensions.get('window');

const stripHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
};

const StarRating = React.memo(({ rating, size = 16, color = '#2563eb' }: { rating: number, size?: number, color?: string }) => {
    // Convert 0-10 or 0-5 to 5-star scale
    const normalizedRating = rating > 5 ? rating / 2 : rating;
    const fullStars = Math.floor(normalizedRating);

    return (
        <View style={{ flexDirection: 'row', gap: 2 }}>
            {[...Array(5)].map((_, i) => (
                <Star
                    key={i}
                    size={size}
                    color={i < fullStars ? color : '#cbd5e1'}
                    fill={i < fullStars ? color : 'transparent'}
                />
            ))}
        </View>
    );
});

const ReviewItem = React.memo(({ review, isLast, styles }: any) => {
    const [expanded, setExpanded] = useState(false);
    const content = stripHtml(review.pros || review.headline || "Excellent stay, very friendly staff and great location.");
    const isLong = content.length > 120;

    return (
        <View style={[styles.reviewItem, !isLast && styles.reviewDivider]}>
            <View style={styles.reviewHeader}>
                <View style={styles.reviewerAvatar}>
                    <Text style={styles.avatarText}>{review.name?.[0] || 'V'}</Text>
                </View>
                <View style={styles.reviewerInfo}>
                    <Text style={styles.reviewerName}>{review.name || 'Verified Traveler'}</Text>
                    <Text style={styles.reviewDate}>{new Date(review.date).toLocaleDateString()}</Text>
                </View>
                <StarRating rating={review.averageScore || 10} size={14} />
            </View>
            <Text style={styles.reviewText} numberOfLines={expanded ? undefined : 3}>
                {content}
            </Text>
            {isLong && (
                <Pressable onPress={() => setExpanded(!expanded)} style={{ marginTop: 4 }}>
                    <Text style={styles.readMoreText}>{expanded ? 'Show less' : 'Read more'}</Text>
                </Pressable>
            )}
        </View>
    );
});

const RoomCard = React.memo(({ room, hotelThumbnail, currency, styles }: any) => {
    // Extensive image detection
    const roomImage = room.roomPhotos?.[0] ||
        room.images?.[0]?.url ||
        room.images?.[0] ||
        room.photos?.[0] ||
        room.roomImages?.[0] ||
        (room.rates?.[0]?.room_images?.[0]) ||
        hotelThumbnail;

    const price = Math.round(room.rates?.[0]?.retailRate?.total?.[0]?.amount || room.rates?.[0]?.retailRate?.total?.amount || room.rates?.[0]?.price?.amount || room.rates?.[0]?.price || 0);

    return (
        <View style={styles.roomCard}>
            <Image source={{ uri: roomImage }} style={styles.roomImage} />
            <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{room.name}</Text>
                <View style={styles.roomAmenities}>
                    <Text style={styles.roomAmenityText}>• Max {room.maxOccupancy || 2} guests</Text>
                    {room.amenities?.slice(0, 3).map((a: string, j: number) => (
                        <Text key={j} style={styles.roomAmenityText}>• {a}</Text>
                    ))}
                </View>
                <View style={styles.roomFooter}>
                    <View>
                        <Text style={styles.roomPrice}>{currency.symbol}{price}</Text>
                        <Text style={styles.perNight}>per night</Text>
                    </View>
                    <Pressable style={styles.selectBtn}>
                        <Text style={styles.selectBtnText}>Select</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
});

export default function HotelDetailsScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const { currency } = useSettings();

    const [loading, setLoading] = useState(true);
    const [hotel, setHotel] = useState<any>(null);
    const [reviews, setReviews] = useState<any[]>([]);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isFacilitiesExpanded, setIsFacilitiesExpanded] = useState(false);

    const styles = getStyles(isDark);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [details, reviewData] = await Promise.all([
                    getHotelDetails(params.id as string, {
                        checkIn: params.checkIn,
                        checkOut: params.checkOut,
                        adults: params.adults,
                        rooms: params.rooms,
                        currency: params.currency
                    }),
                    getHotelReviews(params.id as string, 5)
                ]);
                setHotel(details);
                setReviews(reviewData);
            } catch (err) {
                console.error('Failed to fetch hotel details:', err);
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (!hotel) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Hotel details not found.</Text>
                <Pressable onPress={() => router.back()} style={styles.backBtnLabel}>
                    <Text style={styles.backBtnLabelText}>Go Back</Text>
                </Pressable>
            </View>
        );
    }

    const hotelImages = hotel.images || [hotel.thumbnailUrl];

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
                {/* Image Gallery */}
                <View style={styles.imageContainer}>
                    <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onScroll={(e) => {
                            const x = e.nativeEvent.contentOffset.x;
                            setActiveImageIndex(Math.round(x / width));
                        }}
                    >
                        {hotelImages.map((img: string, i: number) => (
                            <Image key={i} source={{ uri: img }} style={styles.headerImage} />
                        ))}
                    </ScrollView>
                    <View style={styles.imageDots}>
                        {hotelImages.slice(0, 10).map((_: any, i: number) => (
                            <View key={i} style={[styles.dot, activeImageIndex === i && styles.dotActive]} />
                        ))}
                    </View>

                    {/* Floating Header Actions */}
                    <View style={styles.floatingHeader}>
                        <Pressable onPress={() => router.back()} style={styles.roundBtn}>
                            <ChevronLeft size={24} color={isDark ? "#60a5fa" : "#2563eb"} />
                        </Pressable>
                        <View style={styles.headerRight}>
                            <Pressable style={styles.roundBtn}>
                                <Share2 size={20} color={isDark ? "#60a5fa" : "#2563eb"} />
                            </Pressable>
                            <Pressable style={styles.roundBtn}>
                                <Heart size={20} color={isDark ? "#f87171" : "#ef4444"} fill={false ? "#ef4444" : "transparent"} />
                            </Pressable>
                        </View>
                    </View>
                </View>

                <View style={styles.content}>
                    {/* Hotel Title & Rating */}
                    <View style={styles.titleSection}>
                        <Text style={styles.hotelName}>{hotel.name}</Text>
                        <View style={styles.ratingRow}>
                            <StarRating rating={hotel.reviewRating || hotel.starRating || 0} size={20} />
                            <View>
                                <Text style={styles.reviewCount}>{hotel.reviewsCount || 0} verified reviews</Text>
                            </View>
                        </View>
                        <View style={styles.locationRow}>
                            <MapPin size={16} color="#64748b" />
                            <Text style={styles.addressText}>{hotel.address}, {hotel.city}</Text>
                        </View>
                    </View>

                    {/* Quick Info */}
                    <View style={styles.infoGrid}>
                        <View style={[styles.infoItem, !hotel.facilities?.some((f: any) => (f.name || f).toLowerCase().includes('wifi')) && { opacity: 0.3 }]}>
                            <Wifi size={20} color={isDark ? "#3b82f6" : "#2563eb"} />
                            <Text style={styles.infoLabel}>Free Wifi</Text>
                        </View>
                        <View style={[styles.infoItem, !hotel.facilities?.some((f: any) => (f.name || f).toLowerCase().includes('breakfast')) && { opacity: 0.3 }]}>
                            <Coffee size={20} color={isDark ? "#3b82f6" : "#2563eb"} />
                            <Text style={styles.infoLabel}>Breakfast</Text>
                        </View>
                        <View style={[styles.infoItem, !hotel.facilities?.some((f: any) => (f.name || f).toLowerCase().includes('air conditioning')) && { opacity: 0.3 }]}>
                            <Wind size={20} color={isDark ? "#3b82f6" : "#2563eb"} />
                            <Text style={styles.infoLabel}>AC</Text>
                        </View>
                        <View style={[styles.infoItem, !hotel.facilities?.some((f: any) => (f.name || f).toLowerCase().includes('tv')) && { opacity: 0.3 }]}>
                            <Tv size={20} color={isDark ? "#3b82f6" : "#2563eb"} />
                            <Text style={styles.infoLabel}>TV</Text>
                        </View>
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>About this hotel</Text>
                        <Text style={styles.descriptionText} numberOfLines={isDescriptionExpanded ? undefined : 5}>
                            {stripHtml(hotel.description) || "Experience luxury and comfort in the heart of the city. This property offers modern amenities, exceptional service, and a convenient location near major attractions."}
                        </Text>
                        <Pressable style={styles.readMore} onPress={() => setIsDescriptionExpanded(!isDescriptionExpanded)}>
                            <Text style={styles.readMoreText}>{isDescriptionExpanded ? 'Show less' : 'Read more'}</Text>
                        </Pressable>
                    </View>

                    {/* Facilities Section */}
                    {hotel.facilities && hotel.facilities.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Facilities</Text>
                            <View style={styles.facilitiesList}>
                                {hotel.facilities.slice(0, isFacilitiesExpanded ? undefined : 8).map((facility: any, i: number) => (
                                    <View key={i} style={styles.facilityItem}>
                                        <Check size={16} color="#10b981" />
                                        <Text style={styles.facilityText}>{typeof facility === 'string' ? facility : facility.name}</Text>
                                    </View>
                                ))}
                            </View>
                            {hotel.facilities.length > 8 && (
                                <Pressable style={styles.viewMoreBtn} onPress={() => setIsFacilitiesExpanded(!isFacilitiesExpanded)}>
                                    <Text style={styles.viewMoreText}>
                                        {isFacilitiesExpanded ? 'Show less' : `View all ${hotel.facilities.length} facilities`}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    )}

                    {/* Room Options */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Available Rooms</Text>
                        {(hotel.roomTypes || []).map((room: any, i: number) => (
                            <RoomCard key={i} room={room} hotelThumbnail={hotel.thumbnailUrl} currency={currency} styles={styles} />
                        ))}
                    </View>
                    {/* Reviews Section */}
                    {reviews.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Guest Reviews</Text>
                            </View>
                            {reviews.map((review: any, i: number) => (
                                <ReviewItem key={i} review={review} isLast={i === reviews.length - 1} styles={styles} />
                            ))}
                        </View>
                    )}

                    {/* Policy / FAQ Summary */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Property Policies</Text>
                        <View style={styles.policyItem}>
                            <ShieldCheck size={20} color="#64748b" />
                            <View style={styles.policyContent}>
                                <Text style={styles.policyLabel}>Check-in / Check-out</Text>
                                <Text style={styles.policyValue}>Check-in: 2:00 PM • Check-out: 12:00 PM</Text>
                            </View>
                        </View>
                        <View style={styles.policyItem}>
                            <HelpCircle size={20} color="#64748b" />
                            <View style={styles.policyContent}>
                                <Text style={styles.policyLabel}>Important Info</Text>
                                <Text style={styles.policyValue}>Please have a valid ID ready upon arrival. Pets are {hotel.facilities?.some((f: any) => (f.name || f).toLowerCase().includes('pet')) ? 'welcome' : 'not allowed'}.</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Bottom Sticky Booking Bar */}
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={styles.bookingBar}>
                <View>
                    <Text style={styles.bookingPrice}>From {currency.symbol}{Math.round(hotel.price?.amount || hotel.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.amount || 0)}</Text>
                    <Text style={styles.bookingDates}>{params.checkIn} - {params.checkOut}</Text>
                </View>
                <Pressable style={styles.bookBtn} onPress={() => Alert.alert('Coming Soon', 'Booking functionality is being implemented.')}>
                    <Text style={styles.bookBtnText}>Book Now</Text>
                </Pressable>
            </BlurView>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#020617' : '#f8fafc',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: isDark ? '#64748b' : '#94a3b8',
        marginBottom: 20,
    },
    backBtnLabel: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#2563eb',
        borderRadius: 8,
    },
    backBtnLabelText: {
        color: 'white',
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    imageContainer: {
        height: 350,
        position: 'relative',
    },
    headerImage: {
        width: width,
        height: 350,
    },
    imageDots: {
        position: 'absolute',
        bottom: 20,
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'center',
        gap: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    dotActive: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'white',
        transform: [{ scale: 1.2 }],
    },
    floatingHeader: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    headerRight: {
        flexDirection: 'row',
        gap: 12,
    },
    roundBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    content: {
        padding: 20,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        backgroundColor: isDark ? '#020617' : '#f8fafc',
        marginTop: -30,
    },
    titleSection: {
        marginBottom: 24,
    },
    hotelName: {
        fontSize: 24,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 8,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },

    ratingLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    reviewCount: {
        fontSize: 13,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    addressText: {
        fontSize: 14,
        color: isDark ? '#94a3b8' : '#64748b',
        flex: 1,
    },
    infoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        padding: 16,
        borderRadius: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    infoItem: {
        alignItems: 'center',
        gap: 6,
    },
    infoLabel: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
    },
    section: {
        marginBottom: 32,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 12,
    },
    viewAllText: {
        color: '#2563eb',
        fontWeight: '600',
        fontSize: 14,
    },
    descriptionText: {
        fontSize: 15,
        lineHeight: 22,
        color: isDark ? '#94a3b8' : '#475569',
    },
    readMore: {
        marginTop: 8,
    },
    readMoreText: {
        color: '#2563eb',
        fontWeight: '600',
    },
    facilitiesList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    facilityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: (width - 60) / 2,
    },
    facilityText: {
        fontSize: 14,
        color: isDark ? '#e2e8f0' : '#475569',
    },
    viewMoreBtn: {
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        alignItems: 'center',
    },
    viewMoreText: {
        color: isDark ? '#e2e8f0' : '#475569',
        fontWeight: '600',
        fontSize: 13,
    },
    roomCard: {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 20,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    roomImage: {
        width: '100%',
        height: 180,
    },
    roomInfo: {
        padding: 16,
    },
    roomName: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 8,
    },
    roomAmenities: {
        marginBottom: 16,
    },
    roomAmenityText: {
        fontSize: 13,
        color: isDark ? '#64748b' : '#94a3b8',
        marginBottom: 2,
    },
    roomFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roomPrice: {
        fontSize: 22,
        fontWeight: '800',
        color: '#2563eb',
    },
    perNight: {
        fontSize: 12,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    selectBtn: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 14,
    },
    selectBtnText: {
        color: 'white',
        fontWeight: '700',
    },
    reviewItem: {
        paddingVertical: 16,
    },
    reviewDivider: {
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    reviewerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: isDark ? '#94a3b8' : '#64748b',
    },
    reviewerInfo: {
        flex: 1,
    },
    reviewerName: {
        fontSize: 15,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    reviewDate: {
        fontSize: 12,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    reviewScore: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reviewScoreText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    reviewText: {
        fontSize: 14,
        lineHeight: 20,
        color: isDark ? '#cbd5e1' : '#475569',
    },
    policyItem: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
    },
    policyContent: {
        flex: 1,
    },
    policyLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
        marginBottom: 2,
    },
    policyValue: {
        fontSize: 13,
        color: isDark ? '#94a3b8' : '#64748b',
        lineHeight: 18,
    },
    bookingBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    bookingPrice: {
        fontSize: 20,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    bookingDates: {
        fontSize: 12,
        color: isDark ? '#64748b' : '#94a3b8',
    },
    bookBtn: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    bookBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16,
    },
});
