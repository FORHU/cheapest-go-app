'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useUser, useAuthStore } from '@/stores/authStore';
import {
    useCheckoutFormData,
    useBookingOptions,
    usePayeeInfo,
    usePhoneCurrency,
    useCheckoutUIState,
    useCheckoutFormErrors,
    useCheckoutActions,
} from '@/stores/checkoutStore';
import { CheckoutFormData, BookingForType } from '@/components/checkout/types';

interface UseCheckoutFormOptions {
    onCurrencyChange?: (currency: string) => void;
}

interface UseCheckoutFormReturn {
    // Form data
    formData: CheckoutFormData;
    setFormData: (data: Partial<CheckoutFormData>) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;

    // Booking options
    bookingFor: BookingForType;
    setBookingFor: (value: BookingForType) => void;
    isWorkTravel: boolean;
    setIsWorkTravel: (value: boolean) => void;
    specialRequests: string;
    setSpecialRequests: (value: string) => void;

    // Payee info
    payeeFirstName: string;
    setPayeeFirstName: (value: string) => void;
    payeeLastName: string;
    setPayeeLastName: (value: string) => void;

    // Phone/currency
    phoneCountryCode: string;
    setPhoneCountryCode: (value: string) => void;
    selectedCurrency: string;
    setSelectedCurrency: (value: string) => void;

    // UI state
    isSuccess: boolean;
    setIsSuccess: (value: boolean) => void;
    emailSent: boolean;
    setEmailSent: (value: boolean) => void;

    // Validation
    formErrors: Record<string, string>;
    setFormErrors: (errors: Record<string, string>) => void;
    clearFormErrors: () => void;
}

/**
 * Checkout form hook - bridges checkoutStore with React component needs.
 * Handles auto-fill when user logs in using useEffect.
 */
export function useCheckoutForm(options: UseCheckoutFormOptions = {}): UseCheckoutFormReturn {
    const { onCurrencyChange } = options;
    const user = useUser();
    const { isAuthModalOpen } = useAuthStore();

    // Get state from store using granular selectors
    const formData = useCheckoutFormData();
    const { bookingFor, isWorkTravel, specialRequests } = useBookingOptions();
    const { payeeFirstName, payeeLastName } = usePayeeInfo();
    const { phoneCountryCode, selectedCurrency } = usePhoneCurrency();
    const { isSuccess, emailSent } = useCheckoutUIState();
    const formErrors = useCheckoutFormErrors();

    // Get actions from store
    const actions = useCheckoutActions();

    // Track previous user to detect login
    const prevUserRef = useRef(user);
    const prevCurrencyRef = useRef(selectedCurrency);

    // Auto-fill form when user logs in
    useEffect(() => {
        if (user && !prevUserRef.current && !isAuthModalOpen) {
            const needsUpdate = !formData.firstName || !formData.lastName || !formData.email;
            if (needsUpdate) {
                actions.autoFillFromUser(user);
            }
        }
        prevUserRef.current = user;
    }, [user, isAuthModalOpen, formData.firstName, formData.lastName, formData.email, actions]);

    // Notify parent when currency changes
    useEffect(() => {
        if (selectedCurrency !== prevCurrencyRef.current) {
            onCurrencyChange?.(selectedCurrency);
            prevCurrencyRef.current = selectedCurrency;
        }
    }, [selectedCurrency, onCurrencyChange]);

    // Handle input changes - wraps store action with event handling
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        actions.handleInputChange(name, value);
    }, [actions]);

    return {
        formData,
        setFormData: actions.setFormData,
        handleInputChange,
        bookingFor,
        setBookingFor: actions.setBookingFor,
        isWorkTravel,
        setIsWorkTravel: actions.setIsWorkTravel,
        specialRequests,
        setSpecialRequests: actions.setSpecialRequests,
        payeeFirstName,
        setPayeeFirstName: actions.setPayeeFirstName,
        payeeLastName,
        setPayeeLastName: actions.setPayeeLastName,
        phoneCountryCode,
        setPhoneCountryCode: actions.setPhoneCountryCode,
        selectedCurrency,
        setSelectedCurrency: actions.setSelectedCurrency,
        isSuccess,
        setIsSuccess: actions.setIsSuccess,
        emailSent,
        setEmailSent: actions.setEmailSent,
        formErrors,
        setFormErrors: actions.setFormErrors,
        clearFormErrors: actions.clearFormErrors,
    };
}
