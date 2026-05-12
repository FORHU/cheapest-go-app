import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronDown, Sun, Moon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSettings, CURRENCIES } from '../../context/SettingsContext';

const TopBar: React.FC = () => {
    const { colorScheme, toggleColorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';
    const { currency, setCurrency } = useSettings();

    const handleCurrencyPress = () => {
        const currentIndex = CURRENCIES.findIndex(c => c.code === currency.code);
        const nextIndex = (currentIndex + 1) % CURRENCIES.length;
        setCurrency(CURRENCIES[nextIndex].code);
    };

    return (
        <View style={styles.container}>
            {/* Logo */}
            <View style={styles.logoContainer}>
                <Text style={[styles.logoText, isDark && styles.logoTextDark]}>
                    Cheapest<Text style={styles.logoAccent}>Go</Text>
                </Text>
            </View>
 
            {/* Right Side Actions */}
            <View style={styles.actionsContainer}>
                <Pressable 
                    style={[styles.currencyPill, isDark && styles.currencyPillDark]}
                    onPress={handleCurrencyPress}
                >
                    <Text style={styles.regionText}>{currency.region}</Text>
                    <Text style={[styles.currencyText, isDark && styles.currencyTextDark]}>{currency.code}</Text>
                    <ChevronDown size={16} color={isDark ? "#475569" : "#94a3b8"} />
                </Pressable>
 
                <Pressable 
                    onPress={() => toggleColorScheme()}
                    style={styles.themeButton}
                >
                    {isDark ? (
                        <Sun size={24} color="#facc15" />
                    ) : (
                        <Moon size={24} color="#475569" />
                    )}
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 32,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoText: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
    },
    logoTextDark: {
        color: '#ffffff',
    },
    logoAccent: {
        color: '#3b82f6',
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    currencyPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#f1f5f9',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    currencyPillDark: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
    },
    regionText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
    },
    currencyText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
        textTransform: 'uppercase',
    },
    currencyTextDark: {
        color: '#ffffff',
    },
    themeButton: {
        padding: 8,
    },
});

export default TopBar;
