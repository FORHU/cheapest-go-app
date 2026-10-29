import { describe, it, expect } from 'vitest';
import { resolveCaptureFlow, captureFlowOf } from './capture-flow';

describe('resolveCaptureFlow', () => {
    it('is order_first unless the flag is explicitly on', () => {
        expect(resolveCaptureFlow({})).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: '' })).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: 'true' })).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: '1' })).toBe('order_first');
    });

    it('is authorise_first when the flag is on, ignoring case and whitespace', () => {
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: 'on' })).toBe('authorise_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: ' ON ' })).toBe('authorise_first');
    });
});

describe('captureFlowOf', () => {
    it('reads the stamp the intent was created with', () => {
        expect(captureFlowOf({ captureFlow: 'authorise_first' })).toBe('authorise_first');
        expect(captureFlowOf({ captureFlow: 'order_first' })).toBe('order_first');
    });

    it('treats an intent with no stamp as order_first, so every older intent keeps its path', () => {
        expect(captureFlowOf({})).toBe('order_first');
        expect(captureFlowOf(null)).toBe('order_first');
        expect(captureFlowOf(undefined)).toBe('order_first');
        expect(captureFlowOf({ provider: 'mystifly_v2' })).toBe('order_first');
    });
});
