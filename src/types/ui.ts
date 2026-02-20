import { ReactNode } from 'react';

// Base props for components
export interface BaseProps {
    children?: ReactNode;
    className?: string;
}

// Button variants
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends BaseProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
}

// Input props
export interface InputProps {
    label?: string;
    error?: string;
    helperText?: string;
    icon?: ReactNode;
    className?: string;
}

// Modal props
export interface ModalProps extends BaseProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
}

// Theme types
export type Theme = 'dark' | 'light';

export interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}
