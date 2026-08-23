import { describe, it, expect } from 'vitest';
import { parseDuffelDuration } from './duffel';

describe('parseDuffelDuration', () => {
    it('reads the ordinary hour/minute forms', () => {
        expect(parseDuffelDuration('PT2H30M')).toBe(150);
        expect(parseDuffelDuration('PT22H')).toBe(1320);
        expect(parseDuffelDuration('PT45M')).toBe(45);
        expect(parseDuffelDuration('PT3H44M')).toBe(224);
    });

    it('reads a day-only duration, which Duffel sends for an exactly-24h slice', () => {
        // Observed live on an ICN→CRK slice. The T is absent entirely; requiring it read
        // this as zero minutes.
        expect(parseDuffelDuration('P1D')).toBe(1440);
        expect(parseDuffelDuration('P2D')).toBe(2880);
    });

    it('reads a combined day and time duration', () => {
        expect(parseDuffelDuration('P1DT2H30M')).toBe(1590);
    });

    it('tolerates a seconds component without letting it corrupt the total', () => {
        expect(parseDuffelDuration('PT2H30M15S')).toBe(150);
    });

    it('returns zero for anything it cannot read, rather than a partial match', () => {
        expect(parseDuffelDuration('')).toBe(0);
        expect(parseDuffelDuration(undefined as unknown as string)).toBe(0);
        expect(parseDuffelDuration('2h30m')).toBe(0);
        expect(parseDuffelDuration('PT2H30M-junk')).toBe(0);
    });
});
