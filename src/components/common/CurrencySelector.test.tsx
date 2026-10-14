import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const nav = vi.hoisted(() => ({ pathname: '/golf', search: '' as string, replace: vi.fn() }));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: nav.replace }),
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(nav.search),
}));

const actions = vi.hoisted(() => ({ setUserCurrency: vi.fn(), setUserCountry: vi.fn() }));
vi.mock('@/stores/searchStore', () => ({
    useUserCurrency: () => 'USD',
    useUserCountry: () => 'US',
    useSearchActions: () => actions,
}));

// The real menu portals its items; a plain list keeps the behaviour under test in view.
vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>{children}</button>
    ),
}));

import CurrencySelector from './CurrencySelector';

beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = '/golf';
    nav.search = '';
});

const choose = (code: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`${code}$`) }));

describe('CurrencySelector', () => {
    it('puts the choice in the address on golf pages, which price on the server', () => {
        render(<CurrencySelector />);
        choose('PHP');
        expect(actions.setUserCurrency).toHaveBeenCalledWith('PHP');
        expect(nav.replace).toHaveBeenCalledWith('/golf?currency=PHP');
    });

    it('does the same on a course page and keeps the rest of the query', () => {
        nav.pathname = '/golf/wack-wack';
        nav.search = 'date=2030-01-08';
        render(<CurrencySelector />);
        choose('KRW');
        expect(nav.replace).toHaveBeenCalledWith('/golf/wack-wack?date=2030-01-08&currency=KRW');
    });

    it('leaves other pages\' addresses alone', () => {
        nav.pathname = '/about';
        render(<CurrencySelector />);
        choose('PHP');
        expect(actions.setUserCurrency).toHaveBeenCalledWith('PHP');
        expect(nav.replace).not.toHaveBeenCalled();
    });
});
