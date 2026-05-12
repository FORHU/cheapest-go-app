import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { Clock, Sparkles } from 'lucide-react-native';
import { SectionHeader } from '../../ui/SectionHeader';

export const DealCard = ({ deal, index }: any) => {
    return (
        <Pressable 
            className="w-[280px] mr-4 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
        >
            <View className="relative aspect-[4/3]">
                {deal.image && (
                    <Image 
                        source={{ uri: deal.image }} 
                        className="w-full h-full object-cover"
                    />
                )}
                <View className="absolute inset-0 bg-black/20" />
                
                {/* Badges */}
                <View className="absolute top-3 left-3 flex-row gap-2">
                    <View className="px-2 py-1 bg-emerald-500 rounded-full">
                        <Text className="text-[10px] font-bold text-white uppercase">{deal.discount}</Text>
                    </View>
                </View>

                {/* Price */}
                <View className="absolute bottom-3 left-3 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 rounded-xl shadow-sm">
                    <View className="flex-row items-baseline gap-1">
                        <Text className="text-[10px] text-slate-400 line-through">₱{deal.originalPrice?.toLocaleString()}</Text>
                        <Text className="text-sm font-bold text-slate-900 dark:text-white">₱{deal.salePrice?.toLocaleString()}</Text>
                    </View>
                </View>
            </View>

            <View className="p-4">
                <Text className="text-sm font-bold text-slate-900 dark:text-white mb-1" numberOfLines={2}>
                    {deal.title}
                </Text>
                <View className="flex-row items-center gap-1.5 mb-3">
                    <View className="w-1 h-1 bg-blue-500 rounded-full" />
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400" numberOfLines={1}>
                        {deal.subtitle}
                    </Text>
                </View>

                <View className="flex-row items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <View className="flex-row items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        <Text className="text-[10px] text-slate-400">Ends in {deal.endsIn}</Text>
                    </View>
                </View>
            </View>
        </Pressable>
    );
};

const DealsSection = ({ deals }: any) => {
    return (
        <View className="py-6">
            <SectionHeader 
                title="Exclusive Deals" 
                badge={{ icon: Sparkles, text: 'Limited Time', variant: 'amber' }}
                actionHref="/deals"
            />
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
            >
                {deals?.map((deal: any, i: number) => (
                    <DealCard key={deal.id || i} deal={deal} index={i} />
                ))}
            </ScrollView>
        </View>
    );
};

export default DealsSection;
