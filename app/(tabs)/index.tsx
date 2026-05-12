import React from 'react';
import { ScrollView, View, Text, SafeAreaView, StatusBar } from 'react-native';
import { useColorScheme } from 'nativewind';
import Hero from '../../components/landing/Hero';
import YourRecentSearches from '../../components/landing/sections/YourRecentSearches';
import UniqueStays from '../../components/landing/sections/UniqueStays';
import DealsSection from '../../components/landing/sections/DealsSection';
import ExploreVacationPackages from '../../components/landing/sections/ExploreVacationPackages';
import { MOCK_DEALS, MOCK_DESTINATIONS } from '../../constants/LandingMockData';

export default function LandingScreen() {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView 
                className="flex-1"
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <Hero />

                {/* Content Sections */}
                <View className="pb-20">
                    <YourRecentSearches />

                    <UniqueStays />
                    
                    <DealsSection deals={MOCK_DEALS} />
                    
                    <ExploreVacationPackages destinations={MOCK_DESTINATIONS} />

                    {/* App Promo Banner */}
                    <View className="mx-4 mt-6 p-6 bg-blue-600 rounded-3xl overflow-hidden relative">
                        {/* Decorative Circles */}
                        <View className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
                        <View className="absolute -bottom-20 -left-10 w-60 h-60 bg-blue-400/20 rounded-full" />
                        
                        <Text className="text-2xl font-bold text-white mb-2 leading-tight">
                            The world is{'\n'}waiting for you.
                        </Text>
                        <Text className="text-sm text-blue-100 font-medium mb-4 max-w-[200px]">
                            Get the best deals on flights and hotels right from your pocket.
                        </Text>
                        
                        <View className="self-start px-4 py-2 bg-white rounded-xl">
                            <Text className="text-sm font-bold text-blue-600">Explore Now</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
