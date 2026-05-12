import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme, TextInput } from 'react-native';
import { X, RotateCcw, Star, Check } from 'lucide-react-native';
import SearchModal from './SearchModal';

interface FilterModalProps {
    visible: boolean;
    onClose: () => void;
    filters: any;
    onApply: (newFilters: any) => void;
}

const FACILITIES = [
    { id: 28, label: 'Free WiFi' },
    { id: 433, label: 'Swimming Pool' },
    { id: 107, label: 'Spa' },
    { id: 2, label: 'Parking' },
    { id: 7, label: 'Restaurant' },
    { id: 91, label: 'Fitness Center' },
    { id: 6, label: 'Room Service' },
    { id: 76, label: 'Airport Shuttle' },
    { id: 11, label: 'Breakfast Included' },
    { id: 5, label: 'Air Conditioning' },
    { id: 25, label: 'Pet Friendly' },
    { id: 46, label: 'Business Center' },
];

const GUEST_RATINGS = [
    { value: 0, label: 'Any' },
    { value: 9, label: 'Excellent 9+' },
    { value: 8, label: 'Very Good 8+' },
    { value: 7, label: 'Good 7+' },
    { value: 6, label: 'Pleasant 6+' },
];

export default function FilterModal({ visible, onClose, filters, onApply }: FilterModalProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [localFilters, setLocalFilters] = useState(filters);
 
    React.useEffect(() => {
        if (visible) {
            setLocalFilters(filters);
        }
    }, [visible, filters]);

    const toggleStar = (star: number) => {
        const current = [...(localFilters.starRating || [])];
        const index = current.indexOf(star);
        if (index > -1) current.splice(index, 1);
        else current.push(star);
        setLocalFilters({ ...localFilters, starRating: current });
    };

    const toggleFacility = (id: number) => {
        const current = [...(localFilters.facilities || [])];
        const index = current.indexOf(id);
        if (index > -1) current.splice(index, 1);
        else current.push(id);
        setLocalFilters({ ...localFilters, facilities: current });
    };

    const handleReset = () => {
        setLocalFilters({
            hotelName: '',
            starRating: [],
            minRating: 0,
            facilities: [],
        });
    };

    const handleApply = () => {
        onApply(localFilters);
        onClose();
    };

    return (
        <SearchModal visible={visible} onClose={onClose} title="Filters">
            <View style={styles.container}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    {/* Header with Reset */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Filter by</Text>
                        <Pressable onPress={handleReset} style={styles.resetBtn}>
                            <RotateCcw size={14} color="#2563eb" />
                            <Text style={styles.resetText}>Reset</Text>
                        </Pressable>
                    </View>

                    {/* Property Name */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>PROPERTY NAME</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Marriott"
                            placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                            value={localFilters.hotelName}
                            onChangeText={(text) => setLocalFilters({ ...localFilters, hotelName: text })}
                        />
                    </View>

                    {/* Star Rating */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>STAR RATING</Text>
                        <View style={styles.starGrid}>
                            {[5, 4, 3, 2, 1].map((star) => {
                                const isSelected = localFilters.starRating?.includes(star);
                                return (
                                    <Pressable 
                                        key={star} 
                                        style={[styles.filterChip, isSelected && styles.filterChipActive]}
                                        onPress={() => toggleStar(star)}
                                    >
                                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                                            {star} Star{star !== 1 ? 's' : ''}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    {/* Guest Rating */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>GUEST RATING</Text>
                        <View style={styles.radioGrid}>
                            {GUEST_RATINGS.map((option) => {
                                const isSelected = localFilters.minRating === option.value;
                                return (
                                    <Pressable 
                                        key={option.value} 
                                        style={[styles.radioItem, isSelected && styles.radioItemActive]}
                                        onPress={() => setLocalFilters({ ...localFilters, minRating: option.value })}
                                    >
                                        <Text style={[styles.radioText, isSelected && styles.radioTextActive]}>
                                            {option.label}
                                        </Text>
                                        {isSelected && <Check size={16} color="white" />}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    {/* Amenities */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>AMENITIES</Text>
                        <View style={styles.amenityGrid}>
                            {FACILITIES.map((facility) => {
                                const isSelected = localFilters.facilities?.includes(facility.id);
                                return (
                                    <Pressable 
                                        key={facility.id} 
                                        style={[styles.amenityChip, isSelected && styles.amenityChipActive]}
                                        onPress={() => toggleFacility(facility.id)}
                                    >
                                        <Text style={[styles.amenityChipText, isSelected && styles.amenityChipTextActive]}>
                                            {facility.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>

                {/* Footer Apply Button */}
                <View style={styles.footer}>
                    <Pressable style={styles.applyBtn} onPress={handleApply}>
                        <Text style={styles.applyBtnText}>Apply Filters</Text>
                    </Pressable>
                </View>
            </View>
        </SearchModal>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    resetText: {
        fontSize: 14,
        color: '#2563eb',
        fontWeight: '600',
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: isDark ? '#64748b' : '#94a3b8',
        letterSpacing: 1,
        marginBottom: 12,
    },
    input: {
        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: isDark ? '#ffffff' : '#0f172a',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    starGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    filterChipActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    filterChipText: {
        fontSize: 13,
        color: isDark ? '#94a3b8' : '#64748b',
        fontWeight: '500',
    },
    filterChipTextActive: {
        color: 'white',
        fontWeight: '700',
    },
    radioGrid: {
        gap: 8,
    },
    radioItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    radioItemActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    radioText: {
        fontSize: 15,
        color: isDark ? '#e2e8f0' : '#0f172a',
    },
    radioTextActive: {
        color: 'white',
        fontWeight: '700',
    },
    amenityGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    amenityChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    amenityChipActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    amenityChipText: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
    },
    amenityChipTextActive: {
        color: 'white',
        fontWeight: '700',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    applyBtn: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        padding: 16,
        alignItems: 'center',
    },
    applyBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
});
