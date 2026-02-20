import { create } from 'zustand';

interface AuthFormState {
    // Email input (local to form; authStore.email is the "confirmed" value used for API calls)
    localEmail: string;

    // Registration fields shared between EmailStep signup form & RegisterStep
    firstName: string;
    lastName: string;
    password: string;

    // UI state
    showSignupForm: boolean;
    rememberMe: boolean;

    // Per-field validation errors
    errors: Record<string, string>;

    // Actions
    setField: (name: string, value: string) => void;
    setShowSignupForm: (show: boolean) => void;
    setRememberMe: (remember: boolean) => void;
    setErrors: (errors: Record<string, string>) => void;
    clearError: (...fields: string[]) => void;
    clearErrors: () => void;
    reset: () => void;
}

const initialFormState = {
    localEmail: '',
    firstName: '',
    lastName: '',
    password: '',
    showSignupForm: false,
    rememberMe: true,
    errors: {} as Record<string, string>,
};

export const useAuthFormStore = create<AuthFormState>((set) => ({
    ...initialFormState,

    setField: (name, value) =>
        set((state) => ({
            [name]: value,
            errors: { ...state.errors, [name]: '' },
        })),

    setShowSignupForm: (showSignupForm) => set({ showSignupForm }),
    setRememberMe: (rememberMe) => set({ rememberMe }),

    setErrors: (errors) => set({ errors }),
    clearError: (...fields) =>
        set((state) => {
            const next = { ...state.errors };
            fields.forEach((f) => delete next[f]);
            return { errors: next };
        }),
    clearErrors: () => set({ errors: {} }),

    reset: () => set(initialFormState),
}));

// Selectors
export const useAuthFormErrors = () => useAuthFormStore((state) => state.errors);
