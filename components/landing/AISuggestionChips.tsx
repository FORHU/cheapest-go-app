import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Palmtree, Gem, Heart, Plane, Mountain } from 'lucide-react-native';

const suggestions = [
    { label: 'Beach Escape', prompt: 'Beachfront resort in Boracay for 2, this weekend' },
    { label: 'Luxury Stay', prompt: '5-star hotel in Manila under ₱15,000/night' },
    { label: 'Romantic Trip', prompt: "Couple's retreat in Tagaytay with spa" },
    { label: 'Quick Getaway', prompt: 'Last-minute deal in Cebu, 3 nights' },
    { label: 'Adventure', prompt: 'Mountain lodge in Baguio for a group of 4' },
];

const iconMap: Record<string, React.ReactNode> = {
    'Beach Escape': <Palmtree size={12} color="#94a3b8" />,
    'Luxury Stay': <Gem size={12} color="#94a3b8" />,
    'Romantic Trip': <Heart size={12} color="#94a3b8" />,
    'Quick Getaway': <Plane size={12} color="#94a3b8" />,
    'Adventure': <Mountain size={12} color="#94a3b8" />,
};

interface AISuggestionChipsProps {
    onSuggestionClick: (prompt: string) => void;
}

const AISuggestionChips: React.FC<AISuggestionChipsProps> = ({ onSuggestionClick }) => {
    return (
        <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={styles.contentContainer}
        >
            <View style={styles.chipsContainer}>
                {suggestions.map((suggestion) => (
                    <Pressable
                        key={suggestion.label}
                        onPress={() => onSuggestionClick(suggestion.prompt)}
                        style={styles.chip}
                    >
                        {iconMap[suggestion.label]}
                        <Text style={styles.chipText}>
                            {suggestion.label}
                        </Text>
                    </Pressable>
                ))}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: {
        marginTop: 16,
        paddingHorizontal: 16,
    },
    contentContainer: {
        paddingRight: 32,
    },
    chipsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 9999,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    chipText: {
        fontSize: 11,
        fontWeight: '500',
        color: '#475569',
    },
});

export default AISuggestionChips;
