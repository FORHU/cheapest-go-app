import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import { FarePolicyPanel, OfferExpiryBanner, splitPolicyNotice } from '@/components/flights/booking/FareNotices';
import type { FarePolicy } from '@/types/flights';

/**
 * The fare policy and the offer's countdown, as the design draws them — flat on the
 * page, no boxes:
 *
 *   ⏱ Offer expires in 8:44 - complete your booking before the time runs out        (red)
 *
 *   ⚠ Fare Policy Updated  (Refundable (fees may apply)) (Changes allowed)
 *     The refundability of this fare has changed since you selected it. Please review…
 *     Indicative only — final policy confirmed at payment stage.                      (grey)
 */

function withIntl(ui: React.ReactElement) {
    return render(<NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">{ui}</NextIntlClientProvider>);
}

const policy = (over: Partial<FarePolicy> = {}): FarePolicy => ({
    isRefundable: true,
    refundPenaltyAmount: null,
    isChangeable: true,
    policyVersion: 'search',
    ...over,
} as FarePolicy);

describe('splitPolicyNotice', () => {
    it('reads the bold lead as the title and the rest as the explanation', () => {
        expect(splitPolicyNotice('<strong>Fare Policy Updated.</strong> The fare changed. Please review.'))
            .toEqual({ title: 'Fare Policy Updated', body: 'The fare changed. Please review.' });
    });

    it('drops a full-width stop as well as a period from the title', () => {
        expect(splitPolicyNotice('<strong>料金ポリシーが更新されました。</strong> 確認してください。').title)
            .toBe('料金ポリシーが更新されました');
    });

    it('falls back to the whole text when there is no bold lead', () => {
        expect(splitPolicyNotice('Just a sentence.')).toEqual({ title: '', body: 'Just a sentence.' });
    });
});

describe('FarePolicyPanel', () => {
    it('heads an updated policy with the warning, title and badges on one row', () => {
        withIntl(<FarePolicyPanel policy={policy()} policyChanged />);
        const heading = screen.getByRole('heading', { name: 'Fare Policy Updated' });
        const row = heading.parentElement!;
        expect(row.querySelector('[data-icon="warning"]')).toBeTruthy();
        expect(row).toHaveTextContent('Refundable (fees may apply)');
        expect(row).toHaveTextContent('Changes allowed');
    });

    it('explains the change under the title, then the indicative note in grey', () => {
        withIntl(<FarePolicyPanel policy={policy()} policyChanged />);
        expect(screen.getByText(/refundability of this fare has changed/)).toBeInTheDocument();
        expect(screen.getByText(/Indicative only/)).toHaveClass('text-[#939fb1]');
    });

    it('draws the badges as plain grey pills', () => {
        withIntl(<FarePolicyPanel policy={policy()} policyChanged />);
        expect(screen.getByText('Changes allowed')).toHaveClass('rounded-full', 'bg-[#e5e5e5]');
    });

    it('sits flat on the page, not in a card', () => {
        const { container } = withIntl(<FarePolicyPanel policy={policy()} />);
        expect(container.firstElementChild!.className).not.toMatch(/\bborder\b|shadow|rounded-2xl/);
    });

    it('titles an unchanged policy plainly, without the warning', () => {
        withIntl(<FarePolicyPanel policy={policy()} />);
        expect(screen.getByRole('heading', { name: 'Fare Policy' })).toBeInTheDocument();
        expect(document.querySelector('[data-icon="warning"]')).toBeNull();
        expect(screen.queryByText(/refundability of this fare has changed/)).toBeNull();
    });
});

describe('OfferExpiryBanner', () => {
    afterEach(() => vi.useRealTimers());

    it('counts down in red, flat on the page, with the clock glyph', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-29T08:00:00Z'));
        withIntl(<OfferExpiryBanner expiresAt={new Date('2026-09-29T08:08:44Z')} />);
        const line = screen.getByRole('timer');
        expect(line).toHaveTextContent('Offer expires in 8:44 - complete your booking before the time runs out');
        expect(line).toHaveClass('text-red-600');
        expect(line.className).not.toMatch(/\bborder\b|bg-/);
        expect(line.querySelector('svg')).toBeTruthy();

        act(() => { vi.advanceTimersByTime(1000); });
        expect(line).toHaveTextContent('8:43');
    });

    it('stays hidden until the last ten minutes', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-29T08:00:00Z'));
        withIntl(<OfferExpiryBanner expiresAt={new Date('2026-09-29T08:25:00Z')} />);
        expect(screen.queryByRole('timer')).toBeNull();
    });
});
