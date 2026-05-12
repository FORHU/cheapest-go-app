import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';
import { History, MapPin, Calendar, ChevronRight } from 'lucide-react-native';
import { getRecentSearches, RecentSearch } from '../../../lib/search-history';
import { useRouter } from 'expo-router';

export default function YourRecentSearches() {
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();

    useEffect(() => {
        const loadHistory = async () => {
            const history = await getRecentSearches();
            setRecentSearches(history);
        };
        loadHistory();
    }, []);

    if (recentSearches.length === 0) return null;

    const handleSearchClick = (search: RecentSearch) => {
        router.push({
            pathname: '/search',
            params: {
                destination: search.destination,
                placeId: search.placeId,
                countryCode: search.countryCode,
                checkIn: search.checkIn,
                checkOut: search.checkOut,
                adults: search.adults.toString(),
                rooms: search.rooms.toString(),
                currency: 'USD'
            }
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <History size={18} color={isDark ? '#38bdf8' : '#2563eb'} />
                    <Text style={[styles.title, isDark && styles.titleDark]}>Your recent searches</Text>
                </View>
            </View>

            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {recentSearches.map((search) => (
                    <Pressable 
                        key={search.id} 
                        style={[styles.card, isDark && styles.cardDark]}
                        onPress={() => handleSearchClick(search)}
                    >
                        <View style={styles.destRow}>
                            <MapPin size={14} color={isDark ? '#64748b' : '#94a3b8'} />
                            <Text style={[styles.destText, isDark && styles.destTextDark]} numberOfLines={1}>
                                {search.destination}
                            </Text>
                        </View>
                        <View style={styles.dateRow}>
                            <Calendar size={12} color={isDark ? '#475569' : '#94a3b8'} />
                            <Text style={styles.dateText}>
                                {search.checkIn} - {search.checkOut}
                            </Text>
                        </View>
                        <View style={styles.guestRow}>
                            <Text style={styles.guestText}>
                                {search.adults} guests • {search.rooms} room{search.rooms !== 1 ? 's' : ''}
                            </Text>
                            <ChevronRight size={14} color="#2563eb" />
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    titleDark: {
        color: '#ffffff',
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: 12,
        paddingBottom: 4,
    },
    card: {
        width: 200,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardDark: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
    },
    destRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    destText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0f172a',
        flex: 1,
    },
    destTextDark: {
        color: '#ffffff',
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    dateText: {
        fontSize: 12,
        color: '#64748b',
    },
    guestRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    guestText: {
        fontSize: 11,
        fontWeight: '500',
        color: '#2563eb',
    },
});
