import React from 'react';
import { View, Text } from 'react-native';
import { VersionBadge } from './TelemetryComponents';
import { GradientText } from '../GradientText';

const HeroHeadline: React.FC = () => {
    return (
        <View className="items-center px-6">
            <VersionBadge />

            <View className="mb-6 items-center">
                <Text className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tighter leading-[1.05] text-center">
                    Precision Travel.
                </Text>
                
                <GradientText 
                    colors={['#3b82f6', '#06b6d4']}
                    className="text-5xl font-extrabold tracking-tighter leading-[1.05] text-center"
                >
                    Machined for You.
                </GradientText>
            </View>

            <Text className="text-lg text-slate-500 dark:text-slate-400 text-center font-medium leading-relaxed max-w-[280px]">
                The operating system for the modern voyager.
            </Text>
        </View>
    );
};

export default HeroHeadline;
