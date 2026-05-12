import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Switch } from "react-native";
import { FilterState, FlightProvider } from "@core/components/flights/filters";
import { Check } from "lucide-react-native";
import Checkbox from "expo-checkbox";

interface FlightFiltersProps {
    airlines: string[];
    onFilterChange: (filters: FilterState) => void;
}

export default function FlightFilters({ airlines, onFilterChange }: FlightFiltersProps) {
    const [state, setState] = useState<FilterState>({
        sortBy: "price",
        selectedAirlines: [],
        maxStops: null,
        refundableOnly: false,
        selectedProviders: [],
    });

    const updateState = (newState: Partial<FilterState>) => {
        const updated = { ...state, ...newState };
        setState(updated);
        onFilterChange(updated);
    };

    const toggleAirline = (airline: string) => {
        const newAirlines = state.selectedAirlines.includes(airline)
            ? state.selectedAirlines.filter(a => a !== airline)
            : [...state.selectedAirlines, airline];
        updateState({ selectedAirlines: newAirlines });
    };

    return (
        <ScrollView className="flex-1 bg-white dark:bg-slate-900 px-4 py-4">
            {/* Sorting */}
            <View className="mb-6">
                <Text className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-2">Sort By</Text>
                <View className="flex flex-col gap-2">
                    {[
                        { label: "Cheapest First", value: "price" },
                        { label: "Fastest First", value: "duration" },
                        { label: "Earliest Departure", value: "departure" },
                    ].map((opt) => (
                        <Pressable
                            key={opt.value}
                            onPress={() => updateState({ sortBy: opt.value as any })}
                            className={`px-4 py-3 rounded-xl ${
                                state.sortBy === opt.value 
                                ? 'bg-blue-50 dark:bg-blue-900/30' 
                                : 'bg-slate-50 dark:bg-slate-800/50'
                            }`}
                        >
                            <Text className={`text-sm ${
                                state.sortBy === opt.value 
                                ? 'text-blue-600 dark:text-blue-400 font-medium' 
                                : 'text-slate-600 dark:text-slate-400'
                            }`}>
                                {opt.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {/* Stops */}
            <View className="mb-6">
                <Text className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-2">Stops</Text>
                <View className="flex flex-row gap-2">
                    {[
                        { label: "Any", value: null },
                        { label: "Non-stop", value: 0 },
                        { label: "1 Stop", value: 1 },
                    ].map((opt) => (
                        <Pressable
                            key={opt.label}
                            onPress={() => updateState({ maxStops: opt.value })}
                            className={`flex-1 items-center px-2 py-3 rounded-xl ${
                                state.maxStops === opt.value 
                                ? 'bg-blue-600' 
                                : 'bg-slate-50 dark:bg-slate-800/50'
                            }`}
                        >
                            <Text className={`text-xs ${
                                state.maxStops === opt.value 
                                ? 'text-white font-medium' 
                                : 'text-slate-600 dark:text-slate-400'
                            }`}>
                                {opt.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {/* Fare Type */}
            <View className="mb-6 flex flex-row items-center justify-between">
                <View>
                    <Text className="text-sm font-medium text-slate-900 dark:text-white">Refundable Fares Only</Text>
                    <Text className="text-xs text-slate-400">Cancellation with refund</Text>
                </View>
                <Switch
                    value={state.refundableOnly}
                    onValueChange={(val) => updateState({ refundableOnly: val })}
                    trackColor={{ false: "#e2e8f0", true: "#2563eb" }}
                />
            </View>

            {/* Airlines */}
            <View className="mb-10">
                <Text className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-4">Airlines</Text>
                <View className="flex flex-col gap-4">
                    {airlines.map((airline) => (
                        <Pressable 
                            key={airline} 
                            onPress={() => toggleAirline(airline)}
                            className="flex flex-row items-center justify-between"
                        >
                            <Text className="text-sm text-slate-600 dark:text-slate-400">{airline}</Text>
                            <Checkbox
                                value={state.selectedAirlines.includes(airline)}
                                onValueChange={() => toggleAirline(airline)}
                                color={state.selectedAirlines.includes(airline) ? '#2563eb' : undefined}
                            />
                        </Pressable>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
