import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, useColorScheme } from 'react-native';
import { Sparkles, Star } from 'lucide-react-native';

const UNIQUE_STAYS = [
    {
        id: 'u1',
        name: 'The Floating Villa',
        location: 'Maldives',
        price: 450,
        image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=500&q=80',
        badge: 'Water Villa'
    },
    {
        id: 'u2',
        name: 'Arctic Glass Igloo',
        location: 'Finland',
        price: 320,
        image: 'https://images.unsplash.com/photo-1517059224940-d4af9eec41b7?auto=format&fit=crop&w=500&q=80',
        badge: 'Bucket List'
    },
    {
        id: 'u3',
        name: 'Bamboo Treehouse',
        location: 'Bali, Indonesia',
        price: 180,
        image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=500&q=80',
        badge: 'Eco-Friendly'
    },
    {
        id: 'u4',
        name: 'Historic Castle Stay',
        location: 'Scotland',
        price: 280,
        image: 'https://images.unsplash.com/photo-1533154683836-84ea7a0bc310?auto=format&fit=crop&w=500&q=80',
        badge: 'Authentic'
    }
];

export default function UniqueStays() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Sparkles size={20} color="#fbbf24" />
                    <Text style={[styles.title, isDark && styles.titleDark]}>Extraordinary Escapes</Text>
                </View>
                <Text style={styles.subtitle}>One-of-a-kind places for your next trip</Text>
            </View>

            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {UNIQUE_STAYS.map((stay) => (
                    <Pressable key={stay.id} style={[styles.card, isDark && styles.cardDark]}>
                        <View style={styles.imageContainer}>
                            <Image source={{ uri: stay.image }} style={styles.image} />
                            <View style={styles.badge}>
                                <Star size={10} color="white" fill="white" />
                                <Text style={styles.badgeText}>{stay.badge}</Text>
                            </View>
                        </View>
                        <View style={styles.content}>
                            <Text style={[styles.name, isDark && styles.nameDark]} numberOfLines={1}>{stay.name}</Text>
                            <Text style={styles.location}>{stay.location}</Text>
                            <View style={styles.footer}>
                                <Text style={styles.price}>${stay.price}</Text>
                                <Text style={styles.perNight}>/night</Text>
                            </View>
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
        marginBottom: 16,
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
    subtitle: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 2,
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: 16,
        paddingBottom: 4,
    },
    card: {
        width: 240,
        backgroundColor: '#ffffff',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    cardDark: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
    },
    imageContainer: {
        width: '100%',
        height: 140,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    badge: {
        position: 'absolute',
        top: 12,
        left: 12,
        backgroundColor: 'rgba(37, 99, 235, 0.9)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '700',
    },
    content: {
        padding: 12,
    },
    name: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
    },
    nameDark: {
        color: '#ffffff',
    },
    location: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
        marginBottom: 8,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
    },
    price: {
        fontSize: 16,
        fontWeight: '800',
        color: '#2563eb',
    },
    perNight: {
        fontSize: 11,
        color: '#94a3b8',
    },
});
