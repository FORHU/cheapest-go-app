import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ArrowRight } from 'lucide-react-native';

interface SectionHeaderProps {
    title: string;
    badge?: {
        icon: any;
        text: string;
        variant: 'amber' | 'blue' | 'emerald';
    };
    actionHref?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, badge, actionHref }) => {
    return (
        <View className="flex-row items-center justify-between mb-4 px-4">
            <View className="flex-1">
                {badge && (
                    <View className="flex-row items-center self-start px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 mb-1.5 gap-1">
                        <badge.icon size={10} className="text-amber-600 dark:text-amber-400" />
                        <Text className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            {badge.text}
                        </Text>
                    </View>
                )}
                <Text className="text-xl font-bold text-slate-900 dark:text-white">
                    {title}
                </Text>
            </View>
            
            {actionHref && (
                <Pressable className="flex-row items-center gap-1">
                    <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">View All</Text>
                    <ArrowRight size={14} className="text-blue-600 dark:text-blue-400" />
                </Pressable>
            )}
        </View>
    );
};
