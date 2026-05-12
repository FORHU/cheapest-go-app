import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Currency = {
    code: string;
    symbol: string;
    region: string;
};

export const CURRENCIES: Currency[] = [
    { code: 'USD', symbol: '$', region: 'us' },
    { code: 'PHP', symbol: '₱', region: 'ph' },
    { code: 'KRW', symbol: '₩', region: 'kr' },
    { code: 'THB', symbol: '฿', region: 'th' },
    { code: 'SGD', symbol: 'S$', region: 'sg' },
];

interface SettingsContextType {
    currency: Currency;
    setCurrency: (code: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currency, setCurrencyState] = useState<Currency>(CURRENCIES[0]);

    useEffect(() => {
        AsyncStorage.getItem('selected_currency').then((val) => {
            if (val) {
                const found = CURRENCIES.find(c => c.code === val);
                if (found) setCurrencyState(found);
            }
        });
    }, []);

    const setCurrency = (code: string) => {
        const found = CURRENCIES.find(c => c.code === code);
        if (found) {
            setCurrencyState(found);
            AsyncStorage.setItem('selected_currency', code);
        }
    };

    return (
        <SettingsContext.Provider value={{ currency, setCurrency }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
