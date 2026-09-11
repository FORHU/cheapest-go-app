import { describe, it, expect } from 'vitest';
import { readerView } from './translationView';

/**
 * What each reader sees first. One rule for both screens: the translation's language says
 * who it is for — English for the inbox, anything else for the customer.
 */

const customerMsg = {
    senderType: 'guest',
    body: '호텔에 도착했는데 제 예약이 없다고 합니다.',
    translatedBody: 'I arrived at the hotel, but they say I have no reservation.',
    translatedLang: 'en',
    translationStatus: 'translated' as const,
};

const agentReply = {
    senderType: 'agent',
    body: 'I have found your booking and resent the confirmation.',
    translatedBody: '예약을 확인하였으며 확인서를 재전송했습니다.',
    translatedLang: 'ko',
    translationStatus: 'translated' as const,
};

/** A Korean-speaking Agent answering in Korean: translated into English, for the inbox. */
const koreanAgentReply = {
    senderType: 'agent',
    body: '예약을 확인했습니다. 이메일을 확인해 주세요.',
    translatedBody: 'I have confirmed your booking. Please check your email.',
    translatedLang: 'en',
    translationStatus: 'translated' as const,
};

describe('a Korean-speaking Agent replying in Korean', () => {
    it('reaches the customer exactly as typed', () => {
        // Keyed on sender, the customer was shown the English instead.
        const v = readerView(koreanAgentReply, false);
        expect(v.primary).toBe(koreanAgentReply.body);
        expect(v.label).toBeNull();
    });

    it('is shown in English in the inbox, so a colleague can follow the thread', () => {
        const v = readerView(koreanAgentReply, true);
        expect(v.primary).toBe(koreanAgentReply.translatedBody);
        expect(v.original).toBe(koreanAgentReply.body);
        expect(v.label).toBe('translated');
    });
});

describe('pending and failed translations show on the side they were for', () => {
    it("shows the customer, not the Agent, that the Agent's reply is still translating", () => {
        const pending = { ...agentReply, translatedBody: null, translationStatus: 'pending' as const };
        expect(readerView(pending, false).label).toBe('pending');
        expect(readerView(pending, true).label).toBeNull();
    });

    it('falls back to the direction by sender for a row with no recorded language', () => {
        const legacy = { ...customerMsg, translatedBody: null, translatedLang: null, translationStatus: 'untranslated' as const };
        expect(readerView(legacy, true).label).toBe('untranslated');
        expect(readerView(legacy, false).label).toBeNull();
    });
});

describe('the Agent reading', () => {
    it("sees the customer's message in English, with the Korean one click away", () => {
        const v = readerView(customerMsg, true);
        expect(v.primary).toBe(customerMsg.translatedBody);
        expect(v.original).toBe(customerMsg.body);
        expect(v.label).toBe('translated');
    });

    it('sees their own reply as they wrote it', () => {
        const v = readerView(agentReply, true);
        expect(v.primary).toBe(agentReply.body);
        expect(v.label).toBeNull();
    });

    it("sees an untranslatable customer message in the customer's own words, flagged", () => {
        // The case the guard exists for. The translator refused, so the Agent sees Korean
        // and an amber marker — never "I cannot assist with that" in the customer's name.
        const v = readerView({ ...customerMsg, translatedBody: null, translationStatus: 'untranslated' }, true);
        expect(v.primary).toBe(customerMsg.body);
        expect(v.original).toBeNull();
        expect(v.label).toBe('untranslated');
    });

    it('sees the original while a translation is still running', () => {
        const v = readerView({ ...customerMsg, translatedBody: null, translationStatus: 'pending' }, true);
        expect(v.primary).toBe(customerMsg.body);
        expect(v.label).toBe('pending');
    });
});

describe('the customer reading', () => {
    it("sees the Agent's reply in their own language, with the English one click away", () => {
        const v = readerView(agentReply, false);
        expect(v.primary).toBe(agentReply.translatedBody);
        expect(v.original).toBe(agentReply.body);
        expect(v.label).toBe('translated');
    });

    it('sees their own message as they wrote it, never its English rendering', () => {
        // The English exists for the Agent. Showing it back to the customer would put a
        // machine's version of their own sentence in front of them.
        const v = readerView(customerMsg, false);
        expect(v.primary).toBe(customerMsg.body);
        expect(v.label).toBeNull();
    });
});

describe('nothing to translate', () => {
    it('shows an English conversation untouched, to both readers', () => {
        const english = { senderType: 'guest', body: 'Where is my booking?', translationStatus: null };
        expect(readerView(english, true)).toEqual({ primary: 'Where is my booking?', original: null, label: null });
        expect(readerView(english, false)).toEqual({ primary: 'Where is my booking?', original: null, label: null });
    });

    it('never labels a system notice', () => {
        const notice = { senderType: 'system', body: 'Someone will join shortly.', translationStatus: null };
        expect(readerView(notice, true).label).toBeNull();
        expect(readerView(notice, false).label).toBeNull();
    });

    it('treats a translated row with no text as untranslated rather than blank', () => {
        // Defensive: the table forbids this combination, but a reader must never render an
        // empty bubble because a field was missing.
        const v = readerView({ ...customerMsg, translatedBody: null, translationStatus: 'translated' }, true);
        expect(v.primary).toBe(customerMsg.body);
    });
});
