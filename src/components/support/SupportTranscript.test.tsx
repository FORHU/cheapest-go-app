import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportTranscript } from './SupportTranscript';
import type { SupportMessageView } from './types';

/**
 * The transcript is where the notice codes pay off.
 *
 * A `system` row carries English in `body` and a code beside it. The customer must read
 * the code rendered in their own language — that is the whole reason the column exists —
 * and must still read *something* if this build does not know the code, because a blank
 * message in a support chat is indistinguishable from a broken one.
 */

const messages = {
    support: {
        sender: { guest: 'You', ai: 'CheapestGo', agent: 'Support', system: 'Support' },
        typing: 'CheapestGo is typing',
        empty: 'Ask us anything about your trip.',
        machineTranslated: 'LOCALISED machine-made label',
        notice: {
            // Deliberately not the English in `body`, so a test can tell which one rendered.
            budget_spent: 'LOCALISED handover notice',
        },
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

const message = (over: Partial<SupportMessageView>): SupportMessageView => ({
    id: 'm1',
    senderType: 'guest',
    body: 'hello',
    translatedBody: null,
    attachments: [],
    noticeCode: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    ...over,
});

describe('SupportTranscript', () => {
    it('shows what the customer and the assistant each said', () => {
        render(
            <SupportTranscript
                messages={[
                    message({ id: 'm1', senderType: 'guest', body: 'Do you charge a change fee?' }),
                    message({ id: 'm2', senderType: 'ai', body: 'Not on flexible fares.' }),
                ]}
                isTyping={false}
            />,
            { wrapper: Wrapper },
        );

        expect(screen.getByText('Do you charge a change fee?')).toBeInTheDocument();
        expect(screen.getByText('Not on flexible fares.')).toBeInTheDocument();
    });

    it('names who is speaking, so a screen reader can follow the conversation', () => {
        render(
            <SupportTranscript
                messages={[message({ senderType: 'ai', body: 'Not on flexible fares.' })]}
                isTyping={false}
            />,
            { wrapper: Wrapper },
        );

        expect(screen.getByText('CheapestGo')).toBeInTheDocument();
    });

    it('renders a notice from the locale file, not the English stored beside it', () => {
        render(
            <SupportTranscript
                messages={[message({
                    senderType: 'system',
                    noticeCode: 'budget_spent',
                    body: "I've reached the limit of what I can help with in one conversation.",
                })]}
                isTyping={false}
            />,
            { wrapper: Wrapper },
        );

        expect(screen.getByText('LOCALISED handover notice')).toBeInTheDocument();
        expect(screen.queryByText(/I've reached the limit/)).not.toBeInTheDocument();
    });

    it('falls back to the stored text for a notice this build does not know', () => {
        // A row written by a newer deployment, read by an older tab. Better a sentence in
        // the wrong language than an empty bubble or a raw key.
        render(
            <SupportTranscript
                messages={[message({
                    senderType: 'system',
                    noticeCode: 'invented_later' as SupportMessageView['noticeCode'],
                    body: 'A notice from the future.',
                })]}
                isTyping={false}
            />,
            { wrapper: Wrapper },
        );

        expect(screen.getByText('A notice from the future.')).toBeInTheDocument();
    });

    it('shows the typing indicator only while a reply is coming', () => {
        const { rerender } = render(
            <SupportTranscript messages={[message({})]} isTyping />,
            { wrapper: Wrapper },
        );
        expect(screen.getByText('CheapestGo is typing')).toBeInTheDocument();

        rerender(
            <NextIntlClientProvider locale="en" messages={messages}>
                <SupportTranscript messages={[message({})]} isTyping={false} />
            </NextIntlClientProvider>,
        );
        expect(screen.queryByText('CheapestGo is typing')).not.toBeInTheDocument();
    });

    it('invites a first message when there is nothing to show', () => {
        render(<SupportTranscript messages={[]} isTyping={false} />, { wrapper: Wrapper });

        expect(screen.getByText('Ask us anything about your trip.')).toBeInTheDocument();
    });

    it('announces new messages politely rather than interrupting', () => {
        // A chat that grabs a screen reader mid-sentence on every incoming message is
        // worse than one that waits for a pause.
        render(<SupportTranscript messages={[message({})]} isTyping={false} />, { wrapper: Wrapper });

        expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    });
});

/**
 * The stored rendering, shown to the customer.
 *
 * Per ADR-0033 a translation is never presented as the message: it is shown marked as
 * machine-made, because storing it makes it look like authored content and the label is
 * what stops a customer reading a mistranslated policy as CheapestGo's considered wording.
 *
 * The null branch is not an edge case — an English conversation and an outage both produce
 * it, and the reader has to get the author's own words in both.
 */
describe('a machine translation', () => {
    it("shows the Agent's reply rendered into the customer's language, marked machine-made", () => {
        render(
            <Wrapper>
                <SupportTranscript
                    messages={[message({
                        senderType: 'agent',
                        body: 'Your refund has been approved.',
                        translatedBody: 'MACHINE KOREAN REFUND LINE',
                    })]}
                />
            </Wrapper>,
        );

        expect(screen.getByText('MACHINE KOREAN REFUND LINE')).toBeInTheDocument();
        expect(screen.getByText('LOCALISED machine-made label')).toBeInTheDocument();
    });

    it("keeps the Agent's own words on the row, because those are what was actually written", () => {
        // ADR-0033: the original stays authoritative wherever the two disagree, so it is
        // never replaced — a customer disputing what they were promised has to be able to
        // see the sentence an Agent actually sent.
        render(
            <Wrapper>
                <SupportTranscript
                    messages={[message({
                        senderType: 'agent',
                        body: 'Your refund has been approved.',
                        translatedBody: 'MACHINE KOREAN REFUND LINE',
                    })]}
                />
            </Wrapper>,
        );

        expect(screen.getByText('Your refund has been approved.')).toBeInTheDocument();
    });

    it('shows the original alone, unmarked, when there is no rendering', () => {
        render(
            <Wrapper>
                <SupportTranscript
                    messages={[message({
                        senderType: 'agent',
                        body: 'Your refund has been approved.',
                        translatedBody: null,
                    })]}
                />
            </Wrapper>,
        );

        expect(screen.getByText('Your refund has been approved.')).toBeInTheDocument();
        expect(screen.queryByText('LOCALISED machine-made label')).not.toBeInTheDocument();
    });

    it("does not show the customer an English rendering of their own words", () => {
        // A guest row's translation exists for the Agent to read. Showing it back to the
        // person who wrote the original is noise at best, and at worst invites them to
        // correct a rendering that is not addressed to them.
        render(
            <Wrapper>
                <SupportTranscript
                    messages={[message({
                        senderType: 'guest',
                        body: '\uD658\uBD88 \uC5B8\uC81C \uB418\uB098\uC694?',
                        translatedBody: 'MACHINE ENGLISH FOR THE AGENT',
                    })]}
                />
            </Wrapper>,
        );

        expect(screen.queryByText('MACHINE ENGLISH FOR THE AGENT')).not.toBeInTheDocument();
    });
});
