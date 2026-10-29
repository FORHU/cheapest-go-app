import { describe, it, expect } from 'vitest';
import { mapDuffelOrderFailure } from './duffel-order-errors';

const err = (code: string, message = '') => ({ errors: [{ code, message }], meta: { request_id: 'req_1' } });

describe('mapDuffelOrderFailure', () => {
    it('reports an expired offer as flight_unavailable', () => {
        expect(mapDuffelOrderFailure(422, err('offer_no_longer_available'))).toMatchObject({
            errorCode: 'flight_unavailable', httpStatus: 409, duffelCode: 'offer_no_longer_available', requestId: 'req_1',
        });
    });

    it('does not call every 422 an expired fare', () => {
        const result = mapDuffelOrderFailure(422, err('validation_error', 'passport number is invalid'));
        expect(result.errorCode).toBeNull();
        expect(result.httpStatus).toBe(400);
        expect(result.error).toBe('passport number is invalid');
    });

    it('maps balance, phone, seat and outage failures', () => {
        expect(mapDuffelOrderFailure(422, err('insufficient_balance'))).toMatchObject({ errorCode: 'balance_insufficient', httpStatus: 503 });
        expect(mapDuffelOrderFailure(422, err('validation_error', 'phone_number is invalid'))).toMatchObject({ errorCode: 'phone_number_invalid', httpStatus: 400 });
        expect(mapDuffelOrderFailure(422, err('x', 'selected seat service unavailable'))).toMatchObject({ errorCode: 'seats_unavailable', httpStatus: 400 });
        expect(mapDuffelOrderFailure(504, err('timeout'))).toMatchObject({ errorCode: 'supplier_outage', httpStatus: 502 });
    });

    it('checks balance before expiry, since both can arrive as 422', () => {
        const result = mapDuffelOrderFailure(422, err('insufficient_balance', 'offer expired, insufficient balance'));
        expect(result.errorCode).toBe('balance_insufficient');
    });

    it('survives a body with no errors array', () => {
        expect(mapDuffelOrderFailure(500, null)).toMatchObject({ errorCode: 'supplier_outage', httpStatus: 502 });
        expect(mapDuffelOrderFailure(400, {})).toMatchObject({ errorCode: null, httpStatus: 400, error: 'Flight booking failed. Please try again.' });
    });
});
