import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

export interface RecentSearch {
    id: string;
    destination: string;
    countryCode?: string;
    placeId?: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    rooms: number;
    timestamp: number;
}

export async function saveRecentSearch(search: Omit<RecentSearch, 'id' | 'timestamp'>) {
    try {
        const history = await getRecentSearches();
        const newSearch: RecentSearch = {
            ...search,
            id: `${search.destination}-${Date.now()}`,
            timestamp: Date.now(),
        };

        // Remove existing identical search (same destination)
        const filteredHistory = history.filter(h => h.destination !== search.destination);
        const updatedHistory = [newSearch, ...filteredHistory].slice(0, MAX_RECENT_SEARCHES);

        await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updatedHistory));
    } catch (e) {
        console.error('Failed to save search history:', e);
    }
}

export async function getRecentSearches(): Promise<RecentSearch[]> {
    try {
        const jsonValue = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to get search history:', e);
        return [];
    }
}

export async function clearSearchHistory() {
    try {
        await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
        console.error('Failed to clear search history:', e);
    }
}
