import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const store = vi.hoisted(() => ({ currency: 'KRW' }));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => store.currency }));

import { CurrencyCookieSync } from './CurrencyCookieSync';

const cookie = () => document.cookie.split('; ').find(c => c.startsWith('cg_currency='));

beforeEach(() => {
    document.cookie = 'cg_currency=; path=/; max-age=0';
    store.currency = 'KRW';
});

describe('CurrencyCookieSync', () => {
    it('mirrors the selected currency into the cookie golf pages read', () => {
        render(<CurrencyCookieSync />);
        expect(cookie()).toBe('cg_currency=KRW');
    });

    it('follows the selector when the currency changes', () => {
        const { rerender } = render(<CurrencyCookieSync />);
        store.currency = 'PHP';
        rerender(<CurrencyCookieSync />);
        expect(cookie()).toBe('cg_currency=PHP');
    });

    it('writes nothing for a currency customers are not charged in, and clears an old one', () => {
        const { rerender } = render(<CurrencyCookieSync />);
        store.currency = 'JPY';
        rerender(<CurrencyCookieSync />);
        // A browser drops it; happy-dom leaves it empty. Either way the server reads "no choice".
        expect(cookie() ?? 'cg_currency=').toBe('cg_currency=');
    });

    it('renders nothing', () => {
        const { container } = render(<CurrencyCookieSync />);
        expect(container).toBeEmptyDOMElement();
    });
});
