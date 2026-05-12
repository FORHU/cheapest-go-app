import React, { useState, useEffect } from 'react';
import {
    View, Text, Pressable, TextInput, ScrollView,
    StyleSheet, ActivityIndicator, Alert, useColorScheme,
} from 'react-native';
import { Search, MapPin, Calendar, Users, Building2 } from 'lucide-react-native';
import SearchModal from './SearchModal';
import CalendarPicker from './CalendarPicker';
import { autocompleteDestinations, searchHotels, Destination } from '../../lib/api';
import { useRouter } from 'expo-router';
import { saveRecentSearch } from '../../lib/search-history';

interface HotelSearchModalProps {
    visible: boolean;
    onClose: () => void;
}

const HotelSearchModal: React.FC<HotelSearchModalProps> = ({ visible, onClose }) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();

    const [destination, setDestination] = useState<Destination | null>(null);
    const [destQuery, setDestQuery] = useState('');
    const [checkIn, setCheckIn] = useState<Date | null>(null);
    const [checkOut, setCheckOut] = useState<Date | null>(null);
    const [guests, setGuests] = useState(2);
    const [rooms, setRooms] = useState(1);
    const [activeField, setActiveField] = useState<string | null>(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState<Destination[]>([]);
    const [loadingAutocomplete, setLoadingAutocomplete] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    const styles = getStyles(isDark);

    // Debounced autocomplete
    useEffect(() => {
        if (destQuery.length < 2) {
            setSuggestions([]);
            return;
        }
        const timer = setTimeout(async () => {
            setLoadingAutocomplete(true);
            try {
                const results = await autocompleteDestinations(destQuery);
                setSuggestions(results);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingAutocomplete(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [destQuery]);

    const formatDateLocal = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatDateDisplay = (date: Date | null) => {
        if (!date) return 'Add date';
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const handleSelectDestination = (dest: Destination) => {
        setDestination(dest);
        setDestQuery(dest.title);
        setSuggestions([]);
        setActiveField('checkin'); // Auto-advance to check-in
    };

    const handleClearAll = () => {
        setDestination(null);
        setDestQuery('');
        setCheckIn(null);
        setCheckOut(null);
        setGuests(2);
        setRooms(1);
        setActiveField(null);
    };

    const hasValue = !!(destination || destQuery || checkIn || checkOut || guests !== 2);

    const handleSearch = async () => {
        const destValue = destination?.title || destQuery;
        if (!destValue) return Alert.alert('Missing', 'Please select a destination');
        if (!checkIn) return Alert.alert('Missing', 'Please select a check-in date');
        if (!checkOut) return Alert.alert('Missing', 'Please select a check-out date');

        setIsSearching(true);
        
        const params = {
            destination: destValue,
            countryCode: destination?.countryCode || '',
            placeId: destination?.id || '',
            checkIn: formatDateLocal(checkIn),
            checkOut: formatDateLocal(checkOut),
            adults: guests.toString(),
            children: '0',
            rooms: rooms.toString(),
            currency: 'USD',
        };

        // Save to history
        await saveRecentSearch({
            destination: destValue,
            countryCode: destination?.countryCode || '',
            placeId: destination?.id || '',
            checkIn: params.checkIn,
            checkOut: params.checkOut,
            adults: guests,
            rooms: rooms
        });

        onClose();
        // @ts-ignore
        router.push({ pathname: '/search', params });
        setIsSearching(false);
    };

    return (
        <SearchModal visible={visible} onClose={onClose} title="Search Hotels">
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Clear All */}
                {hasValue && (
                    <View style={styles.clearRow}>
                        <Pressable onPress={handleClearAll} style={styles.clearButton}>
                            <Text style={styles.clearText}>CLEAR ALL</Text>
                        </Pressable>
                    </View>
                )}

                {/* WHERE */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'where' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'where' ? null : 'where')}
                >
                    {activeField === 'where' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>Where?</Text>
                            <View style={styles.inputRow}>
                                <MapPin size={18} color="#3b82f6" />
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Search city or hotel"
                                    placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
                                    value={destQuery}
                                    onChangeText={(text) => {
                                        setDestQuery(text);
                                        if (destination) setDestination(null);
                                    }}
                                    autoFocus
                                />
                                {loadingAutocomplete && <ActivityIndicator size="small" color="#3b82f6" />}
                            </View>

                            {suggestions.length > 0 && (
                                <View style={styles.suggestionsContainer}>
                                    {suggestions.map((item, i) => (
                                        <Pressable
                                            key={`${item.title}-${i}`}
                                            onPress={() => handleSelectDestination(item)}
                                            style={styles.suggestionItem}
                                        >
                                            <Building2 size={16} color={isDark ? "#64748b" : "#94a3b8"} />
                                            <View style={styles.suggestionText}>
                                                <Text style={styles.suggestionTitle}>{item.title}</Text>
                                                <Text style={styles.suggestionSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Text style={styles.fieldLabel}>WHERE</Text>
                                <Text style={styles.fieldHint}>Search city or hotel</Text>
                            </View>
                            <Text style={styles.fieldValue}>{destination?.title || destQuery || "I'm flexible"}</Text>
                        </View>
                    )}
                </Pressable>

                {/* CHECK-IN */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'checkin' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'checkin' ? null : 'checkin')}
                >
                    {activeField === 'checkin' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>When's your check-in?</Text>
                            <CalendarPicker
                                inline
                                selectedDate={checkIn}
                                onSelect={(date) => {
                                    setCheckIn(date);
                                    if (checkOut && date >= checkOut) setCheckOut(null);
                                    setActiveField('checkout');
                                }}
                                minDate={new Date()}
                            />
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Text style={styles.fieldLabel}>CHECK-IN</Text>
                                <Text style={styles.fieldHint}>Add dates</Text>
                            </View>
                            <Text style={styles.fieldValue}>{formatDateDisplay(checkIn)}</Text>
                        </View>
                    )}
                </Pressable>

                {/* CHECK-OUT */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'checkout' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'checkout' ? null : 'checkout')}
                >
                    {activeField === 'checkout' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>When's your check-out?</Text>
                            <CalendarPicker
                                inline
                                selectedDate={checkOut}
                                onSelect={(date) => {
                                    if (checkIn && date <= checkIn) return Alert.alert('Invalid Date', 'Check-out must be after check-in');
                                    setCheckOut(date);
                                    setActiveField(null);
                                }}
                                minDate={checkIn || new Date()}
                            />
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Text style={styles.fieldLabel}>CHECK-OUT</Text>
                                <Text style={styles.fieldHint}>Add dates</Text>
                            </View>
                            <Text style={styles.fieldValue}>{formatDateDisplay(checkOut)}</Text>
                        </View>
                    )}
                </Pressable>

                {/* WHO */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'who' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'who' ? null : 'who')}
                >
                    {activeField === 'who' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>Who's coming?</Text>
                            <View style={styles.guestCounter}>
                                <Text style={styles.guestLabel}>Guests</Text>
                                <View style={styles.counterRow}>
                                    <Pressable onPress={() => setGuests(Math.max(1, guests - 1))} style={styles.counterBtn}>
                                        <Text style={styles.counterBtnText}>−</Text>
                                    </Pressable>
                                    <Text style={styles.counterValue}>{guests}</Text>
                                    <Pressable onPress={() => setGuests(Math.min(10, guests + 1))} style={styles.counterBtn}>
                                        <Text style={styles.counterBtnText}>+</Text>
                                    </Pressable>
                                </View>
                            </View>
                            <View style={[styles.guestCounter, { marginTop: 12 }]}>
                                <Text style={styles.guestLabel}>Rooms</Text>
                                <View style={styles.counterRow}>
                                    <Pressable onPress={() => setRooms(Math.max(1, rooms - 1))} style={styles.counterBtn}>
                                        <Text style={styles.counterBtnText}>−</Text>
                                    </Pressable>
                                    <Text style={styles.counterValue}>{rooms}</Text>
                                    <Pressable onPress={() => setRooms(Math.min(5, rooms + 1))} style={styles.counterBtn}>
                                        <Text style={styles.counterBtnText}>+</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Text style={styles.fieldLabel}>WHO</Text>
                                <Text style={styles.fieldHint}>Number of guests</Text>
                            </View>
                            <Text style={styles.fieldValue}>
                                {guests} guest{guests !== 1 ? 's' : ''} · {rooms} room{rooms !== 1 ? 's' : ''}
                            </Text>
                        </View>
                    )}
                </Pressable>
            </ScrollView>

            {/* Sticky Search Button */}
            <View style={styles.searchButtonContainer}>
                <Pressable onPress={handleSearch} style={[styles.searchButton, isSearching && styles.searchButtonDisabled]} disabled={isSearching}>
                    {isSearching ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <>
                            <Search size={18} color="white" />
                            <Text style={styles.searchButtonText}>Search</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </SearchModal>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { padding: 12, paddingBottom: 120, gap: 8 },
    clearRow: { alignItems: 'flex-end', paddingHorizontal: 4, paddingVertical: 4 },
    clearButton: { 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 9999, 
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9' 
    },
    clearText: { 
        fontSize: 10, 
        fontWeight: '400', 
        color: isDark ? '#94a3b8' : '#64748b', 
        letterSpacing: 1.5 
    },
    fieldCard: { 
        backgroundColor: isDark ? '#0f172a' : '#ffffff', 
        borderRadius: 16, 
        borderWidth: 1, 
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0 : 0.05,
        shadowRadius: 2,
        elevation: isDark ? 0 : 1,
    },
    fieldCardActive: { borderColor: isDark ? '#334155' : '#3b82f6' },
    collapsedField: { paddingHorizontal: 16, paddingVertical: 14, minHeight: 64, justifyContent: 'center' },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldLabel: { 
        fontSize: 10, 
        fontWeight: '400', 
        color: isDark ? '#64748b' : '#94a3b8', 
        letterSpacing: 1.5 
    },
    fieldHint: { 
        fontSize: 10, 
        fontWeight: '400', 
        color: isDark ? '#475569' : '#94a3b8' 
    },
    fieldValue: { 
        fontSize: 16, 
        fontWeight: '400', 
        color: isDark ? '#38bdf8' : '#2563eb', 
        marginTop: 2 
    },
    expandedField: { padding: 16 },
    expandedTitle: { 
        fontSize: 18, 
        fontWeight: '400', 
        color: isDark ? '#ffffff' : '#0f172a', 
        marginBottom: 16 
    },
    inputRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 12, 
        backgroundColor: isDark ? '#1e293b' : '#f8fafc', 
        borderRadius: 12, 
        paddingHorizontal: 12, 
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#e2e8f0',
    },
    textInput: { 
        flex: 1, 
        fontSize: 16, 
        color: isDark ? '#ffffff' : '#0f172a', 
        padding: 0 
    },
    suggestionsContainer: { 
        marginTop: 8, 
        borderRadius: 12, 
        backgroundColor: isDark ? '#1e293b' : '#ffffff', 
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#e2e8f0',
    },
    suggestionItem: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 12, 
        paddingHorizontal: 14, 
        paddingVertical: 12, 
        borderBottomWidth: 1, 
        borderBottomColor: isDark ? '#0f172a' : '#f1f5f9' 
    },
    suggestionText: { flex: 1 },
    suggestionTitle: { 
        fontSize: 14, 
        fontWeight: '400', 
        color: isDark ? '#e2e8f0' : '#0f172a' 
    },
    suggestionSubtitle: { 
        fontSize: 12, 
        color: isDark ? '#64748b' : '#94a3b8', 
        marginTop: 1 
    },
    guestCounter: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between' 
    },
    guestLabel: { 
        fontSize: 16, 
        fontWeight: '400', 
        color: isDark ? '#e2e8f0' : '#0f172a' 
    },
    counterRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 16 
    },
    counterBtn: {
        width: 40, 
        height: 40, 
        borderRadius: 20, 
        borderWidth: 1, 
        borderColor: isDark ? '#334155' : '#e2e8f0',
        backgroundColor: isDark ? '#1e293b' : '#ffffff', 
        alignItems: 'center', 
        justifyContent: 'center',
    },
    counterBtnText: { 
        fontSize: 20, 
        fontWeight: '400', 
        color: isDark ? '#e2e8f0' : '#0f172a' 
    },
    counterValue: { 
        fontSize: 18, 
        fontWeight: '400', 
        color: isDark ? '#ffffff' : '#0f172a', 
        minWidth: 24, 
        textAlign: 'center' 
    },
    searchButtonContainer: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: 16, 
        paddingBottom: 32,
        backgroundColor: isDark ? 'transparent' : 'rgba(255,255,255,0.8)',
    },
    searchButton: {
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: 8,
        backgroundColor: '#2563eb', 
        borderRadius: 14, 
        height: 52,
        shadowColor: '#2563eb', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.3, 
        shadowRadius: 12, 
        elevation: 8,
    },
    searchButtonDisabled: { opacity: 0.7 },
    searchButtonText: { 
        fontSize: 16, 
        fontWeight: '600', 
        color: '#ffffff' 
    },
});

export default HotelSearchModal;
