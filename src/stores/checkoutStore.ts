import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { CheckoutFormData, BookingForType } from '@/components/checkout/types';

/**
 * Currency mapping by country code
 */
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
    'PH': 'PHP', 'SG': 'SGD', 'MY': 'MYR', 'ID': 'IDR',
    'TH': 'THB', 'VN': 'VND', 'KR': 'KRW', 'JP': 'JPY', 'US': 'USD'
};

/**
 * Default form data
 */
const DEFAULT_FORM_DATA: CheckoutFormData = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    guestFirstName: '',
    guestLastName: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
    cardCountry: 'PH',
    cardAddress: '',
    cardCity: '',
    cardZip: ''
};

export interface CheckoutState {
    // Form data
    formData: CheckoutFormData;

    // Booking options
    bookingFor: BookingForType;
    isWorkTravel: boolean;
    specialRequests: string;

    // Payee info (when booking for someone else)
    payeeFirstName: string;
    payeeLastName: string;

    // Phone/currency
    phoneCountryCode: string;
    selectedCurrency: string;

    // UI state
    isSuccess: boolean;
    emailSent: boolean;

    // Validation errors (field name → message)
    formErrors: Record<string, string>;

    // Actions
    setFormData: (data: Partial<CheckoutFormData>) => void;
    setFormField: (name: keyof CheckoutFormData, value: string) => void;
    setBookingFor: (value: BookingForType) => void;
    setIsWorkTravel: (value: boolean) => void;
    setSpecialRequests: (value: string) => void;
    setPayeeFirstName: (value: string) => void;
    setPayeeLastName: (value: string) => void;
    setPhoneCountryCode: (value: string) => void;
    setSelectedCurrency: (value: string) => void;
    setIsSuccess: (value: boolean) => void;
    setEmailSent: (value: boolean) => void;
    setFormErrors: (errors: Record<string, string>) => void;
    clearFormErrors: () => void;

    // Composite actions
    handleInputChange: (name: string, value: string) => void;
    autoFillFromUser: (user: { firstName?: string; lastName?: string; email?: string }) => void;
    resetForm: () => void;
}

export const useCheckoutStore = create<CheckoutState>()((set, get) => ({
    // Initial state
    formData: { ...DEFAULT_FORM_DATA },
    bookingFor: 'myself',
    isWorkTravel: false,
    specialRequests: '',
    payeeFirstName: '',
    payeeLastName: '',
    phoneCountryCode: '+63',
    selectedCurrency: 'PHP',
    isSuccess: false,
    emailSent: false,
    formErrors: {},

    // Form data actions
    setFormData: (data) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),

    setFormField: (name, value) => set((state) => ({
        formData: { ...state.formData, [name]: value }
    })),

    // Booking options
    setBookingFor: (value) => set({ bookingFor: value }),
    setIsWorkTravel: (value) => set({ isWorkTravel: value }),
    setSpecialRequests: (value) => set({ specialRequests: value }),

    // Payee info
    setPayeeFirstName: (value) => set({ payeeFirstName: value }),
    setPayeeLastName: (value) => set({ payeeLastName: value }),

    // Phone/currency
    setPhoneCountryCode: (value) => set({ phoneCountryCode: value }),
    setSelectedCurrency: (value) => set({ selectedCurrency: value }),

    // UI state
    setIsSuccess: (value) => set({ isSuccess: value }),
    setEmailSent: (value) => set({ emailSent: value }),
    setFormErrors: (formErrors) => set({ formErrors }),
    clearFormErrors: () => set({ formErrors: {} }),

    // Composite actions
    handleInputChange: (name, value) => {
        const state = get();

        // Update form field
        if (name in state.formData) {
            set((s) => ({
                formData: { ...s.formData, [name]: value }
            }));
        }

        // Auto-switch currency based on billing country
        if (name === 'cardCountry' && COUNTRY_CURRENCY_MAP[value]) {
            set({ selectedCurrency: COUNTRY_CURRENCY_MAP[value] });
        }
    },

    autoFillFromUser: (user) => {
        if (!user) return;

        set((state) => ({
            formData: {
                ...state.formData,
                firstName: state.formData.firstName || user.firstName || '',
                lastName: state.formData.lastName || user.lastName || '',
                email: state.formData.email || user.email || '',
            }
        }));
    },

    resetForm: () => set({
        formData: { ...DEFAULT_FORM_DATA },
        bookingFor: 'myself',
        isWorkTravel: false,
        specialRequests: '',
        payeeFirstName: '',
        payeeLastName: '',
        phoneCountryCode: '+63',
        selectedCurrency: 'PHP',
        isSuccess: false,
        emailSent: false,
        formErrors: {},
    }),
}));

// Granular selectors for performance optimization

/** Select form data */
export const useCheckoutFormData = () => useCheckoutStore((state) => state.formData);

/** Select booking options */
export const useBookingOptions = () =>
    useCheckoutStore(
        useShallow((state) => ({
            bookingFor: state.bookingFor,
            isWorkTravel: state.isWorkTravel,
            specialRequests: state.specialRequests,
        }))
    );

/** Select payee info */
export const usePayeeInfo = () =>
    useCheckoutStore(
        useShallow((state) => ({
            payeeFirstName: state.payeeFirstName,
            payeeLastName: state.payeeLastName,
        }))
    );

/** Select phone and currency */
export const usePhoneCurrency = () =>
    useCheckoutStore(
        useShallow((state) => ({
            phoneCountryCode: state.phoneCountryCode,
            selectedCurrency: state.selectedCurrency,
        }))
    );

/** Select UI state */
export const useCheckoutUIState = () =>
    useCheckoutStore(
        useShallow((state) => ({
            isSuccess: state.isSuccess,
            emailSent: state.emailSent,
        }))
    );

/** Select form errors */
export const useCheckoutFormErrors = () => useCheckoutStore((state) => state.formErrors);

/** Select all checkout actions */
export const useCheckoutActions = () =>
    useCheckoutStore(
        useShallow((state) => ({
            setFormData: state.setFormData,
            setFormField: state.setFormField,
            setBookingFor: state.setBookingFor,
            setIsWorkTravel: state.setIsWorkTravel,
            setSpecialRequests: state.setSpecialRequests,
            setPayeeFirstName: state.setPayeeFirstName,
            setPayeeLastName: state.setPayeeLastName,
            setPhoneCountryCode: state.setPhoneCountryCode,
            setSelectedCurrency: state.setSelectedCurrency,
            setIsSuccess: state.setIsSuccess,
            setEmailSent: state.setEmailSent,
            setFormErrors: state.setFormErrors,
            clearFormErrors: state.clearFormErrors,
            handleInputChange: state.handleInputChange,
            autoFillFromUser: state.autoFillFromUser,
            resetForm: state.resetForm,
        }))
    );
