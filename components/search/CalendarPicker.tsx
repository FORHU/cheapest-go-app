import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, FlatList, Dimensions } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface CalendarPickerProps {
    onSelect: (date: Date) => void;
    selectedDate: Date | null;
    title?: string;
    onDone?: () => void;
    minDate?: Date;
    inline?: boolean;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({ onSelect, selectedDate, title, onDone, minDate, inline }) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const [activeTab, setActiveTab] = useState<'calendar' | 'flexible'>('calendar');
    
    const [currentMonth, setCurrentMonth] = useState(() => {
        if (selectedDate) return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    });

    const styles = getStyles(isDark, inline);

    const handlePrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const calendarData = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const data = [];
        for (let i = 0; i < firstDay; i++) {
            data.push({ id: `pad-${i}`, day: null });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            data.push({ id: `day-${i}`, day: i, date: new Date(year, month, i) });
        }
        return data;
    }, [currentMonth]);

    const renderDay = ({ item }: { item: any }) => {
        if (item.day === null) return <View style={styles.dayBox} />;

        const isSelected = selectedDate && item.date.toDateString() === selectedDate.toDateString();
        const isToday = item.date.toDateString() === new Date().toDateString();
        const isPast = minDate ? item.date < new Date(new Date(minDate).setHours(0,0,0,0)) : item.date < new Date(new Date().setHours(0,0,0,0));

        return (
            <Pressable
                onPress={() => !isPast && onSelect(item.date)}
                style={[
                    styles.dayBox,
                    isSelected && styles.daySelected,
                    isPast && styles.dayDisabled
                ]}
            >
                <Text style={[
                    styles.dayText,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                    isPast && styles.dayTextDisabled
                ]}>
                    {item.day}
                </Text>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            {!inline && title && <Text style={styles.title}>{title}</Text>}

            {/* Tabs */}
            <View style={styles.tabs}>
                <Pressable 
                    onPress={() => setActiveTab('calendar')}
                    style={[styles.tab, activeTab === 'calendar' && styles.tabActive]}
                >
                    <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>CALENDAR</Text>
                </Pressable>
                <Pressable 
                    onPress={() => setActiveTab('flexible')}
                    style={[styles.tab, activeTab === 'flexible' && styles.tabActive]}
                >
                    <Text style={[styles.tabText, activeTab === 'flexible' && styles.tabTextActive]}>FLEXIBLE DATES</Text>
                </Pressable>
            </View>

            {activeTab === 'calendar' ? (
                <View style={styles.calendarContainer}>
                    {/* Month/Year Navigation */}
                    <View style={styles.header}>
                        <View style={styles.monthYear}>
                            <Text style={styles.monthText}>{MONTHS[currentMonth.getMonth()].toUpperCase()}</Text>
                            <Text style={styles.yearText}>{currentMonth.getFullYear()}</Text>
                        </View>
                        <View style={styles.navButtons}>
                            <Pressable onPress={handlePrevMonth} style={styles.navBtn}>
                                <ChevronLeft size={18} color={isDark ? "#cbd5e1" : "#0f172a"} />
                            </Pressable>
                            <Pressable onPress={handleNextMonth} style={styles.navBtn}>
                                <ChevronRight size={18} color={isDark ? "#cbd5e1" : "#0f172a"} />
                            </Pressable>
                        </View>
                    </View>

                    {/* Weekday Headers */}
                    <View style={styles.weekHeader}>
                        {DAYS.map((d, i) => (
                            <Text key={i} style={styles.weekDayText}>{d}</Text>
                        ))}
                    </View>

                    {/* Days Grid */}
                    <FlatList
                        data={calendarData}
                        renderItem={renderDay}
                        keyExtractor={item => item.id}
                        numColumns={7}
                        scrollEnabled={false}
                        contentContainerStyle={styles.daysGrid}
                    />
                </View>
            ) : (
                <View style={styles.flexibleContainer}>
                    <Text style={styles.flexiblePlaceholder}>Flexible dates options coming soon</Text>
                </View>
            )}

            {/* Footer */}
            {!inline && onDone && (
                <View style={styles.footer}>
                    <Pressable onPress={onDone} style={styles.doneButton}>
                        <Text style={styles.doneButtonText}>Done</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
};

const { width } = Dimensions.get('window');

const getStyles = (isDark: boolean, inline?: boolean) => {
    const padding = inline ? 0 : 24;
    const daySize = (width - (inline ? 64 : 48)) / 7;

    return StyleSheet.create({
        container: {
            flex: inline ? undefined : 1,
            paddingHorizontal: padding,
        },
        title: {
            fontSize: 28,
            fontWeight: '400',
            color: isDark ? '#ffffff' : '#0f172a',
            marginBottom: 20,
        },
        tabs: {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
            marginBottom: 16,
        },
        tab: {
            flex: 1,
            paddingVertical: 10,
            alignItems: 'center',
        },
        tabActive: {
            borderBottomWidth: 2,
            borderBottomColor: '#2563eb',
        },
        tabText: {
            fontSize: 10,
            fontWeight: '400',
            color: isDark ? '#64748b' : '#94a3b8',
            letterSpacing: 1,
        },
        tabTextActive: {
            color: '#2563eb',
        },
        calendarContainer: {
            flex: inline ? undefined : 1,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        monthYear: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        monthText: {
            fontSize: 12,
            fontWeight: '400',
            color: isDark ? '#ffffff' : '#0f172a',
        },
        yearText: {
            fontSize: 12,
            fontWeight: '400',
            color: isDark ? '#64748b' : '#94a3b8',
        },
        navButtons: {
            flexDirection: 'row',
            gap: 4,
        },
        navBtn: {
            padding: 4,
        },
        weekHeader: {
            flexDirection: 'row',
            marginBottom: 6,
        },
        weekDayText: {
            flex: 1,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: '400',
            color: isDark ? '#475569' : '#94a3b8',
        },
        daysGrid: {
            paddingBottom: inline ? 8 : 24,
        },
        dayBox: {
            width: daySize,
            height: daySize,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            marginVertical: 1,
        },
        daySelected: {
            backgroundColor: '#2563eb',
        },
        dayDisabled: {
            opacity: 0.2,
        },
        dayText: {
            fontSize: 13,
            fontWeight: '400',
            color: isDark ? '#cbd5e1' : '#0f172a',
        },
        dayTextSelected: {
            color: '#ffffff',
            fontWeight: '400',
        },
        dayTextToday: {
            color: '#2563eb',
            fontWeight: '400',
        },
        dayTextDisabled: {
            color: isDark ? '#475569' : '#cbd5e1',
        },
        flexibleContainer: {
            height: inline ? 200 : undefined,
            flex: inline ? undefined : 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        flexiblePlaceholder: {
            color: isDark ? '#64748b' : '#94a3b8',
            fontSize: 12,
        },
        footer: {
            paddingVertical: 20,
            alignItems: 'flex-end',
        },
        doneButton: {
            backgroundColor: '#2563eb',
            paddingHorizontal: 36,
            paddingVertical: 12,
            borderRadius: 20,
            shadowColor: '#2563eb',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
        },
        doneButtonText: {
            color: '#ffffff',
            fontSize: 16,
            fontWeight: '400',
        },
    });
};

export default CalendarPicker;
