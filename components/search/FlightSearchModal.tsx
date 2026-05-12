import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, useColorScheme, Alert } from 'react-native';
import { Search, Plane, Calendar, Users, ArrowRight } from 'lucide-react-native';
import SearchModal from './SearchModal';
import CalendarPicker from './CalendarPicker';
import { useRouter } from 'expo-router';
import { autocompleteAirports, type Airport } from '../../lib/api';
import { MapPin, Loader2 } from 'lucide-react-native';

interface FlightSearchModalProps {
    visible: boolean;
    onClose: () => void;
}

type TripType = 'round-trip' | 'one-way';

interface FlightSearchState {
    tripType: TripType;
    from: string;
    to: string;
    departure: Date | null;
    returnDate: Date | null;
    passengers: number;
    cabinClass: string;
}

const FlightSearchModal: React.FC<FlightSearchModalProps> = ({ visible, onClose }) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();

    const [state, setState] = useState<FlightSearchState>({
        tripType: 'round-trip',
        from: '',
        to: '',
        departure: null,
        returnDate: null,
        passengers: 1,
        cabinClass: 'Economy',
    });
    const [activeField, setActiveField] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<Airport[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    React.useEffect(() => {
        const query = activeField === 'from' ? state.from : (activeField === 'to' ? state.to : '');
        // Only search if it looks like they are typing a new code/city, 
        // not if it's already a full selection like "City (IATA)"
        if (query.length < 2 || query.includes('(')) {
            setSuggestions([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const results = await autocompleteAirports(query);
                setSuggestions(results);
            } catch (err) {
                console.warn('Autocomplete failed', err);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [state.from, state.to, activeField]);

    const handleSelectAirport = (airport: Airport) => {
        const formatted = `${airport.city} (${airport.iata})`;
        if (activeField === 'from') {
            setState({ ...state, from: formatted });
            setActiveField('to');
        } else if (activeField === 'to') {
            setState({ ...state, to: formatted });
            setActiveField(null);
        }
    };

    const styles = getStyles(isDark);

    const formatDateLocal = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatDateDisplay = (date: Date | null) => {
        if (!date) return 'Add date';
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const handleClearAll = () => {
        setState({ tripType: 'round-trip', from: '', to: '', departure: null, returnDate: null, passengers: 1, cabinClass: 'Economy' });
        setActiveField(null);
    };

    const hasValue = !!(state.from || state.to || state.departure || state.returnDate || state.passengers !== 1);

    const handleSearch = () => {
        if (!state.from || !state.to) return Alert.alert('Missing', 'Please enter origin and destination');
        if (!state.departure) return Alert.alert('Missing', 'Please select a departure date');
        
        // Extract IATA from "City (IATA)" or just use the string if it's already 3 chars
        const getIata = (str: string) => {
            const match = str.match(/\(([A-Z]{3})\)/);
            if (match) return match[1];
            if (str.length === 3) return str.toUpperCase();
            return str; // Fallback
        };

        const params = {
            from: getIata(state.from),
            to: getIata(state.to),
            departure: formatDateLocal(state.departure),
            returnDate: state.returnDate ? formatDateLocal(state.returnDate) : '',
            passengers: state.passengers.toString(),
            cabin: state.cabinClass,
            tripType: state.tripType
        };

        onClose();
        // @ts-ignore
        router.push({ pathname: '/flights', params });
    };

    const cabinOptions = ['Economy', 'Premium Economy', 'Business', 'First'];

    return (
        <SearchModal visible={visible} onClose={onClose} title="Search Flights">
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Clear All */}
                {hasValue && (
                    <View style={styles.clearRow}>
                        <Pressable onPress={handleClearAll} style={styles.clearButton}>
                            <Text style={styles.clearText}>CLEAR ALL</Text>
                        </Pressable>
                    </View>
                )}

                {/* Trip Type Toggle */}
                <View style={styles.tripTypeRow}>
                    <Pressable
                        onPress={() => setState({ ...state, tripType: 'round-trip' })}
                        style={[styles.tripTypeBtn, state.tripType === 'round-trip' && styles.tripTypeBtnActive]}
                    >
                        <Text style={[styles.tripTypeText, state.tripType === 'round-trip' && styles.tripTypeTextActive]}>
                            Round Trip
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={() => setState({ ...state, tripType: 'one-way', returnDate: null })}
                        style={[styles.tripTypeBtn, state.tripType === 'one-way' && styles.tripTypeBtnActive]}
                    >
                        <Text style={[styles.tripTypeText, state.tripType === 'one-way' && styles.tripTypeTextActive]}>
                            One Way
                        </Text>
                    </Pressable>
                </View>

                {/* FROM */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'from' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'from' ? null : 'from')}
                >
                    {activeField === 'from' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>From where?</Text>
                            <View style={styles.inputRow}>
                                <Plane size={18} color="#3b82f6" />
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Origin airport or city"
                                    placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
                                    value={state.from}
                                    onChangeText={(text) => setState({ ...state, from: text })}
                                    autoFocus
                                />
                                {loadingSuggestions && activeField === 'from' && <Loader2 size={16} color="#3b82f6" style={styles.loader} />}
                            </View>
                            {activeField === 'from' && suggestions.length > 0 && (
                                <View style={styles.suggestionsContainer}>
                                    {suggestions.map((item) => (
                                        <Pressable 
                                            key={item.iata} 
                                            style={styles.suggestionItem}
                                            onPress={() => handleSelectAirport(item)}
                                        >
                                            <MapPin size={16} color={isDark ? "#64748b" : "#94a3b8"} />
                                            <View style={styles.suggestionText}>
                                                <Text style={styles.suggestionCity}>{item.city} ({item.iata})</Text>
                                                <Text style={styles.suggestionName}>{item.name}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Plane size={14} color={isDark ? "#475569" : "#94a3b8"} />
                                <Text style={styles.fieldLabel}>FROM</Text>
                            </View>
                            <Text style={styles.fieldValue}>{state.from || 'Select origin'}</Text>
                        </View>
                    )}
                </Pressable>

                {/* TO */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'to' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'to' ? null : 'to')}
                >
                    {activeField === 'to' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>Going to?</Text>
                            <View style={styles.inputRow}>
                                <Plane size={18} color="#3b82f6" style={{ transform: [{ rotate: '90deg' }] }} />
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Destination airport or city"
                                    placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
                                    value={state.to}
                                    onChangeText={(text) => setState({ ...state, to: text })}
                                    autoFocus
                                />
                                {loadingSuggestions && activeField === 'to' && <Loader2 size={16} color="#3b82f6" style={styles.loader} />}
                            </View>
                            {activeField === 'to' && suggestions.length > 0 && (
                                <View style={styles.suggestionsContainer}>
                                    {suggestions.map((item) => (
                                        <Pressable 
                                            key={item.iata} 
                                            style={styles.suggestionItem}
                                            onPress={() => handleSelectAirport(item)}
                                        >
                                            <MapPin size={16} color={isDark ? "#64748b" : "#94a3b8"} />
                                            <View style={styles.suggestionText}>
                                                <Text style={styles.suggestionCity}>{item.city} ({item.iata})</Text>
                                                <Text style={styles.suggestionName}>{item.name}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Plane size={14} color={isDark ? "#475569" : "#94a3b8"} style={{ transform: [{ rotate: '90deg' }] }} />
                                <Text style={styles.fieldLabel}>TO</Text>
                            </View>
                            <Text style={styles.fieldValue}>{state.to || 'Select destination'}</Text>
                        </View>
                    )}
                </Pressable>

                {/* DEPARTURE */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'departure' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'departure' ? null : 'departure')}
                >
                    {activeField === 'departure' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>Departure date</Text>
                            <CalendarPicker
                                inline
                                selectedDate={state.departure}
                                onSelect={(date) => {
                                    setState({ ...state, departure: date });
                                    if (state.tripType === 'round-trip') {
                                        setActiveField('return');
                                    } else {
                                        setActiveField(null);
                                    }
                                }}
                                minDate={new Date()}
                            />
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Calendar size={14} color={isDark ? "#475569" : "#94a3b8"} />
                                <Text style={styles.fieldLabel}>DEPARTURE</Text>
                            </View>
                            <Text style={styles.fieldValue}>{formatDateDisplay(state.departure)}</Text>
                        </View>
                    )}
                </Pressable>

                {/* RETURN (only for round-trip) */}
                {state.tripType === 'round-trip' && (
                    <Pressable
                        style={[styles.fieldCard, activeField === 'return' && styles.fieldCardActive]}
                        onPress={() => setActiveField(activeField === 'return' ? null : 'return')}
                    >
                        {activeField === 'return' ? (
                            <View style={styles.expandedField}>
                                <Text style={styles.expandedTitle}>Return date</Text>
                                <CalendarPicker
                                    inline
                                    selectedDate={state.returnDate}
                                    onSelect={(date) => {
                                        if (state.departure && date <= state.departure) return Alert.alert('Invalid Date', 'Return must be after departure');
                                        setState({ ...state, returnDate: date });
                                        setActiveField(null);
                                    }}
                                    minDate={state.departure || new Date()}
                                />
                            </View>
                        ) : (
                            <View style={styles.collapsedField}>
                                <View style={styles.labelRow}>
                                    <Calendar size={14} color={isDark ? "#475569" : "#94a3b8"} />
                                    <Text style={styles.fieldLabel}>RETURN</Text>
                                </View>
                                <Text style={styles.fieldValue}>{formatDateDisplay(state.returnDate)}</Text>
                            </View>
                        )}
                    </Pressable>
                )}

                {/* TRAVELERS */}
                <Pressable
                    style={[styles.fieldCard, activeField === 'travelers' && styles.fieldCardActive]}
                    onPress={() => setActiveField(activeField === 'travelers' ? null : 'travelers')}
                >
                    {activeField === 'travelers' ? (
                        <View style={styles.expandedField}>
                            <Text style={styles.expandedTitle}>Travelers & Cabin</Text>
                            <View style={styles.guestCounter}>
                                <Text style={styles.guestLabel}>Passengers</Text>
                                <View style={styles.counterRow}>
                                    <Pressable
                                        onPress={() => setState({ ...state, passengers: Math.max(1, state.passengers - 1) })}
                                        style={styles.counterBtn}
                                    >
                                        <Text style={styles.counterBtnText}>−</Text>
                                    </Pressable>
                                    <Text style={styles.counterValue}>{state.passengers}</Text>
                                    <Pressable
                                        onPress={() => setState({ ...state, passengers: Math.min(9, state.passengers + 1) })}
                                        style={styles.counterBtn}
                                    >
                                        <Text style={styles.counterBtnText}>+</Text>
                                    </Pressable>
                                </View>
                            </View>
                            <View style={styles.cabinPicker}>
                                {cabinOptions.map((cabin) => (
                                    <Pressable
                                        key={cabin}
                                        onPress={() => setState({ ...state, cabinClass: cabin })}
                                        style={[styles.cabinOption, state.cabinClass === cabin && styles.cabinOptionActive]}
                                    >
                                        <Text style={[styles.cabinOptionText, state.cabinClass === cabin && styles.cabinOptionTextActive]}>
                                            {cabin}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.collapsedField}>
                            <View style={styles.labelRow}>
                                <Users size={14} color={isDark ? "#475569" : "#94a3b8"} />
                                <Text style={styles.fieldLabel}>TRAVELERS</Text>
                            </View>
                            <Text style={styles.fieldValue}>
                                {state.passengers} Guest{state.passengers !== 1 ? 's' : ''} • {state.cabinClass}
                            </Text>
                        </View>
                    )}
                </Pressable>
            </ScrollView>

            {/* Sticky Search Button */}
            <View style={styles.searchButtonContainer}>
                <Pressable onPress={handleSearch} style={styles.searchButton}>
                    <Text style={styles.searchButtonText}>Search</Text>
                    <ArrowRight size={18} color="white" />
                </Pressable>
            </View>
        </SearchModal>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { padding: 12, paddingBottom: 100, gap: 8 },
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
    tripTypeRow: {
        flexDirection: 'row', 
        alignSelf: 'center', 
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: 9999, 
        padding: 4, 
        borderWidth: 1, 
        borderColor: isDark ? '#1e293b' : '#e2e8f0', 
        marginBottom: 8,
    },
    tripTypeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 9999 },
    tripTypeBtnActive: { backgroundColor: '#2563eb' },
    tripTypeText: { fontSize: 13, fontWeight: '400', color: isDark ? '#64748b' : '#94a3b8' },
    tripTypeTextActive: { color: '#ffffff' },
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
    guestCounter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    guestLabel: { fontSize: 16, fontWeight: '400', color: isDark ? '#e2e8f0' : '#0f172a' },
    counterRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
    counterBtnText: { fontSize: 20, fontWeight: '400', color: isDark ? '#e2e8f0' : '#0f172a' },
    counterValue: { fontSize: 18, fontWeight: '400', color: isDark ? '#ffffff' : '#0f172a', minWidth: 24, textAlign: 'center' },
    cabinPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cabinOption: {
        paddingHorizontal: 14, 
        paddingVertical: 8, 
        borderRadius: 9999,
        backgroundColor: isDark ? '#1e293b' : '#f8fafc', 
        borderWidth: 1, 
        borderColor: isDark ? '#334155' : '#e2e8f0',
    },
    cabinOptionActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    cabinOptionText: { fontSize: 12, fontWeight: '400', color: isDark ? '#94a3b8' : '#64748b' },
    cabinOptionTextActive: { color: '#ffffff' },
    searchButtonContainer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 16, paddingBottom: 32,
        backgroundColor: isDark ? 'transparent' : 'rgba(255,255,255,0.8)',
    },
    searchButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#2563eb', borderRadius: 14, height: 52,
        shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    },
    searchButtonText: { fontSize: 16, fontWeight: '400', color: '#ffffff' },
    loader: { marginLeft: 'auto' },
    suggestionsContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#1e293b' : '#f1f5f9' },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#1e293b' : '#f1f5f9' },
    suggestionText: { flex: 1 },
    suggestionCity: { fontSize: 14, fontWeight: '600', color: isDark ? '#ffffff' : '#0f172a' },
    suggestionName: { fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 2 },
});

export default FlightSearchModal;
