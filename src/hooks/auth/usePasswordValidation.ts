'use client';

import { useMemo } from 'react';

export interface PasswordRequirement {
    label: string;
    met: boolean;
}

interface UsePasswordValidationReturn {
    requirements: PasswordRequirement[];
    allMet: boolean;
    isValid: boolean;
}

/**
 * Hook for password validation with requirements checking.
 * Pure computation - no state or effects.
 */
export function usePasswordValidation(password: string): UsePasswordValidationReturn {
    const requirements = useMemo((): PasswordRequirement[] => [
        { label: '8+ characters', met: password.length >= 8 },
        { label: 'Uppercase', met: /[A-Z]/.test(password) },
        { label: 'Lowercase', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
    ], [password]);

    const allMet = requirements.every(req => req.met);

    return {
        requirements,
        allMet,
        isValid: allMet && password.length > 0,
    };
}
