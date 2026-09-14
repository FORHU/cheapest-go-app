import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import { useAuthStore } from '@/stores/authStore';
import { ResetPasswordContent } from './ResetPasswordContent';

/**
 * QA BG-15: on a phone, the reset link from the email opened a page frozen in a loading
 * state — fields disabled, a spinner where the button's label should be.
 */

const renderPage = () => render(
    <NextIntlClientProvider locale="en" messages={en}>
        <ResetPasswordContent />
    </NextIntlClientProvider>,
);

const fillValidPassword = () => {
    fireEvent.change(document.querySelector('#password')!, { target: { value: 'Newpass-2026x' } });
    fireEvent.change(document.querySelector('#confirmPassword')!, { target: { value: 'Newpass-2026x' } });
};

beforeEach(() => {
    window.history.replaceState({}, '', '/auth/reset-password?token=abc-123');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('reset password page', () => {
    it('is usable while the app-wide session check has not answered', () => {
        // The frozen state: the store still loading, as on first paint and on a slow phone.
        useAuthStore.setState({ isLoading: true });
        renderPage();

        expect((document.querySelector('#password') as HTMLInputElement).disabled).toBe(false);
        expect((document.querySelector('#confirmPassword') as HTMLInputElement).disabled).toBe(false);
        const button = screen.getByRole('button', { name: 'Reset Password' });
        expect(button.querySelector('.animate-spin')).toBeNull();
    });

    it('shows progress only while its own request is out, then success', async () => {
        let answer!: (r: Response) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { answer = r; })));
        renderPage();
        fillValidPassword();

        fireEvent.submit(document.querySelector('form')!);
        await waitFor(() => expect((document.querySelector('#password') as HTMLInputElement).disabled).toBe(true));

        await act(async () => { answer(new Response(JSON.stringify({ success: true }), { status: 200 })); });
        expect(await screen.findByText('Password Reset Successful')).toBeInTheDocument();
    });

    it('gives the form back with the server\'s reason when the link is expired', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid or expired reset token.' }), { status: 400 })));
        renderPage();
        fillValidPassword();

        fireEvent.submit(document.querySelector('form')!);
        expect(await screen.findByText('Invalid or expired reset token.')).toBeInTheDocument();
        expect((document.querySelector('#password') as HTMLInputElement).disabled).toBe(false);
    });

    it('does not spin forever when the request never answers', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
            init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })));
        renderPage();
        fillValidPassword();

        fireEvent.submit(document.querySelector('form')!);
        await act(async () => { vi.advanceTimersByTime(20_000); });

        expect(await screen.findByText('Failed to reset password. Please try again.')).toBeInTheDocument();
        expect((document.querySelector('#password') as HTMLInputElement).disabled).toBe(false);
    });

    it('says the link is invalid when it carries no token', async () => {
        window.history.replaceState({}, '', '/auth/reset-password');
        renderPage();
        fillValidPassword();
        fireEvent.submit(document.querySelector('form')!);
        expect(await screen.findByText('Invalid reset link. Please request a new one.')).toBeInTheDocument();
    });
});

describe('session check', () => {
    it('stops waiting after 10 s, so screens that wait on it are not held disabled', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
            init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })));
        useAuthStore.setState({ isLoading: true, user: null });

        const pending = useAuthStore.getState().initSession();
        await act(async () => { vi.advanceTimersByTime(10_000); });
        await pending;

        expect(useAuthStore.getState().isLoading).toBe(false);
        expect(useAuthStore.getState().user).toBeNull();
    });
});
