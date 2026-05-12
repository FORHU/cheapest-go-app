import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { SectionHeader } from '../../ui/SectionHeader';
import { Plane } from 'lucide-react-native';

const ExploreVacationPackages = ({ destinations }: any) => {
    return (
        <View className="py-6">
            <SectionHeader 
                title="Popular Destinations" 
                badge={{ icon: Plane, text: 'Trending', variant: 'blue' }}
            />
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
            >
                {destinations?.map((item: any, i: number) => (
                    <Pressable 
                        key={i}
                        className="w-[160px] mr-4 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
                    >
                        <View className="aspect-square relative">
                            <Image source={{ uri: item.image }} className="w-full h-full object-cover" />
                            <View className="absolute inset-0 bg-black/10" />
                        </View>
                        <View className="p-3">
                            <Text className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">{item.title}</Text>
                            <Text className="text-[10px] text-slate-500 dark:text-slate-400">{item.subtitle}</Text>
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
};

export default ExploreVacationPackages;
