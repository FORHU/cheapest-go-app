'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useUser, useAuthStore } from '@/stores/authStore';
import { CheckoutFormData, BookingForType } from '@/components/checkout/types';

interface UseCheckoutFormOptions {
    onCurrencyChange?: (currency: string) => void;
}

interface UseCheckoutFormReturn {
    // Form data
    formData: CheckoutFormData;
    setFormData: React.Dispatch<React.SetStateAction<CheckoutFormData>>;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;

    // Booking options
    bookingFor: BookingForType;
    setBookingFor: React.Dispatch<React.SetStateAction<BookingForType>>;
    isWorkTravel: boolean;
    setIsWorkTravel: React.Dispatch<React.SetStateAction<boolean>>;
    specialRequests: string;
    setSpecialRequests: React.Dispatch<React.SetStateAction<string>>;

    // Payee info
    payeeFirstName: string;
    setPayeeFirstName: React.Dispatch<React.SetStateAction<string>>;
    payeeLastName: string;
    setPayeeLastName: React.Dispatch<React.SetStateAction<string>>;

    // Phone/currency
    phoneCountryCode: string;
    setPhoneCountryCode: React.Dispatch<React.SetStateAction<string>>;
    selectedCurrency: string;
    setSelectedCurrency: React.Dispatch<React.SetStateAction<string>>;

    // UI state
    isSuccess: boolean;
    setIsSuccess: React.Dispatch<React.SetStateAction<boolean>>;
    emailSent: boolean;
    setEmailSent: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Consolidates all checkout form state and handlers.
 * Auto-fills form when user logs in using useEffect.
 */
export function useCheckoutForm(options: UseCheckoutFormOptions = {}): UseCheckoutFormReturn {
    const { onCurrencyChange } = options;
    const user = useUser();
    const { isAuthModalOpen } = useAuthStore();

    // Pre-fill form with user data - computed once
    const initialFormData = useMemo((): CheckoutFormData => ({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        phone: '',
        email: user?.email || '',
        guestFirstName: '',
        guestLastName: '',
        cardNumber: '',
        expiry: '',
        cvc: '',
        cardCountry: 'PH',
        cardAddress: '',
        cardCity: '',
        cardZip: ''
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    const [formData, setFormData] = useState<CheckoutFormData>(initialFormData);

    // Booking options
    const [bookingFor, setBookingFor] = useState<BookingForType>('myself');
    const [isWorkTravel, setIsWorkTravel] = useState(false);
    const [specialRequests, setSpecialRequests] = useState('');

    // Payee info
    const [payeeFirstName, setPayeeFirstName] = useState('');
    const [payeeLastName, setPayeeLastName] = useState('');

    // Phone/currency
    const [phoneCountryCode, setPhoneCountryCode] = useState('+63');
    const [selectedCurrency, setSelectedCurrency] = useState('PHP');

    // UI state
    const [isSuccess, setIsSuccess] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    // Track previous user to detect login
    const prevUserRef = useRef(user);

    // Auto-fill form when user logs in
    useEffect(() => {
        if (user && !prevUserRef.current && !isAuthModalOpen) {
            const needsUpdate = !formData.firstName || !formData.lastName || !formData.email;
            if (needsUpdate) {
                setFormData(prev => ({
                    ...prev,
                    firstName: prev.firstName || user.firstName || '',
                    lastName: prev.lastName || user.lastName || '',
                    email: prev.email || user.email || '',
                }));
            }
        }
        prevUserRef.current = user;
    }, [user, isAuthModalOpen, formData.firstName, formData.lastName, formData.email]);

    // Handle input changes with auto currency switch
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Auto-switch currency based on billing country
        if (name === 'cardCountry') {
            const currencyMap: Record<string, string> = {
                'PH': 'PHP', 'SG': 'SGD', 'MY': 'MYR', 'ID': 'IDR',
                'TH': 'THB', 'VN': 'VND', 'KR': 'KRW', 'JP': 'JPY', 'US': 'USD'
            };
            if (currencyMap[value]) {
                setSelectedCurrency(currencyMap[value]);
                onCurrencyChange?.(currencyMap[value]);
            }
        }
    }, [onCurrencyChange]);

    return {
        formData,
        setFormData,
        handleInputChange,
        bookingFor,
        setBookingFor,
        isWorkTravel,
        setIsWorkTravel,
        specialRequests,
        setSpecialRequests,
        payeeFirstName,
        setPayeeFirstName,
        payeeLastName,
        setPayeeLastName,
        phoneCountryCode,
        setPhoneCountryCode,
        selectedCurrency,
        setSelectedCurrency,
        isSuccess,
        setIsSuccess,
        emailSent,
        setEmailSent,
    };
}
