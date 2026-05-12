import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Activity } from 'lucide-react-native';

export const VersionBadge = () => (
    <View style={styles.badge}>
        <Activity size={12} color="#3b82f6" />
        <Text style={styles.badgeText}>
            Smart Price Tracking
        </Text>
    </View>
);

const styles = StyleSheet.create({
    badge: {
        marginBottom: 24,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.2)',
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#3b82f6',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
});
