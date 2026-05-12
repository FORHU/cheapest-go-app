import React from 'react';
import { View, Text } from 'react-native';
import HeroHeadline from './HeroHeadline';
import AISearchBar from './AISearchBar';
import AISuggestionChips from './AISuggestionChips';
import TopBar from './TopBar';
import SearchPill from './SearchPill';

type SearchMode = 'Stays' | 'Flights' | 'AI Search';

const Hero = () => {
    const [activeTab, setActiveTab] = React.useState<SearchMode>('Stays');

    return (
        <View className="w-full items-center pt-2 pb-8 relative">
            {/* Background Glow Effect */}
            <View 
                className="absolute top-40 w-[300px] h-[300px] bg-blue-500/5 rounded-full" 
                pointerEvents="none" 
            />

            <TopBar />
            
            <View className="mt-8 w-full items-center">
                <HeroHeadline />
                
                <View className="mt-6 w-full items-center">
                    <Text className="text-slate-500 dark:text-slate-500 text-[10px] font-bold tracking-widest uppercase mb-2">
                        Ask anything. Book everything.
                    </Text>
                    <SearchPill activeTab={activeTab} onTabChange={setActiveTab} />
                </View>

                <AISearchBar activeTab={activeTab} />
                <AISuggestionChips onSuggestionClick={(prompt) => console.log('Prompt:', prompt)} />
            </View>
        </View>
    );
};

export default Hero;
