import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Bed, Plane, Sparkles, Search } from 'lucide-react-native';
import HotelSearchModal from '../search/HotelSearchModal';
import FlightSearchModal from '../search/FlightSearchModal';

type TabName = 'Stays' | 'Flights' | 'AI Search';

interface AISearchBarProps {
    activeTab: TabName;
}

const AISearchBar: React.FC<AISearchBarProps> = ({ activeTab }) => {
    const [hotelModalVisible, setHotelModalVisible] = useState(false);
    const [flightModalVisible, setFlightModalVisible] = useState(false);
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const getPlaceholder = () => {
        switch (activeTab) {
            case 'Stays': return 'Where to next?';
            case 'Flights': return 'Search flights';
            case 'AI Search': return 'How can I help you?';
            default: return 'Where to next?';
        }
    };

    const getSubtext = () => {
        switch (activeTab) {
            case 'Stays': return 'Any week · 2 guests';
            case 'Flights': return 'Find the best deals';
            case 'AI Search': return 'Ask anything about travel';
            default: return '';
        }
    };

    const getIcon = () => {
        switch (activeTab) {
            case 'Stays': return <Bed size={20} color="#3b82f6" />;
            case 'Flights': return <Plane size={20} color="#3b82f6" />;
            case 'AI Search': return <Sparkles size={20} color="#3b82f6" />;
            default: return <Search size={20} color="#94a3b8" />;
        }
    };

    const handlePress = () => {
        if (activeTab === 'Stays') setHotelModalVisible(true);
        else if (activeTab === 'Flights') setFlightModalVisible(true);
        else console.log('AI Search tapped');
    };

    const styles = getStyles(isDark);

    return (
        <>
            <View style={styles.container}>
                <Pressable style={styles.searchBar} onPress={handlePress}>
                    {getIcon()}
                    <View style={styles.textContainer}>
                        <Text style={styles.placeholder}>{getPlaceholder()}</Text>
                        <Text style={styles.subtext}>{getSubtext()}</Text>
                    </View>
                </Pressable>
            </View>

            <HotelSearchModal
                visible={hotelModalVisible}
                onClose={() => setHotelModalVisible(false)}
            />
            <FlightSearchModal
                visible={flightModalVisible}
                onClose={() => setFlightModalVisible(false)}
            />
        </>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 16,
        marginTop: 16,
    },
    searchBar: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderWidth: 1,
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 20,
        gap: 14,
        shadowColor: isDark ? '#000' : '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.05,
        shadowRadius: 12,
        elevation: 4,
    },
    textContainer: {
        flex: 1,
    },
    placeholder: {
        fontSize: 15,
        fontWeight: '400',
        color: isDark ? '#ffffff' : '#0f172a',
    },
    subtext: {
        fontSize: 12,
        fontWeight: '400',
        color: isDark ? '#64748b' : '#94a3b8',
        marginTop: 1,
    },
});

export default AISearchBar;
