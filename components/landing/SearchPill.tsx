import React from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Bed, Plane, Sparkles } from 'lucide-react-native';

type TabName = 'Stays' | 'Flights' | 'AI Search';

interface SearchPillProps {
    activeTab: TabName;
    onTabChange: (tab: TabName) => void;
}

const SearchPill: React.FC<SearchPillProps> = ({ activeTab, onTabChange }) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={styles.container}>
            <View style={styles.pillContainer}>
                <Pressable
                    onPress={() => onTabChange('Stays')}
                    style={[styles.tab, activeTab === 'Stays' && styles.activeTab]}
                >
                    <Bed size={14} color={activeTab === 'Stays' ? 'white' : '#94a3b8'} />
                    <Text style={[styles.tabText, activeTab === 'Stays' && styles.activeTabText]}>
                        Stays
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => onTabChange('Flights')}
                    style={[styles.tab, activeTab === 'Flights' && styles.activeTab]}
                >
                    <Plane size={14} color={activeTab === 'Flights' ? 'white' : '#94a3b8'} />
                    <Text style={[styles.tabText, activeTab === 'Flights' && styles.activeTabText]}>
                        Flights
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => onTabChange('AI Search')}
                    style={[styles.tab, activeTab === 'AI Search' && styles.activeTab]}
                >
                    <Sparkles size={14} color={activeTab === 'AI Search' ? 'white' : '#94a3b8'} />
                    <Text style={[styles.tabText, activeTab === 'AI Search' && styles.activeTabText]}>
                        AI Search
                    </Text>
                </Pressable>
            </View>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        marginTop: 32,
        width: '100%',
        alignItems: 'center',
    },
    pillContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(226, 232, 240, 0.5)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(51, 65, 85, 1)' : 'rgba(226, 232, 240, 1)',
        borderRadius: 9999,
        padding: 4,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 9999,
    },
    activeTab: {
        backgroundColor: '#2563eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '700',
        color: isDark ? '#94a3b8' : '#64748b',
    },
    activeTabText: {
        color: 'white',
    },
});

export default SearchPill;
