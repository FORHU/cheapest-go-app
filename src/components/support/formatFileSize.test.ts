import { describe, expect, it } from 'vitest';
import { formatFileSize } from './formatFileSize';

describe('formatFileSize', () => {
    it('shows bytes below a kilobyte', () => {
        expect(formatFileSize(0)).toBe('0 B');
        expect(formatFileSize(999)).toBe('999 B');
    });

    it('shows whole kilobytes', () => {
        expect(formatFileSize(1024)).toBe('1 KB');
        expect(formatFileSize(1024 * 400)).toBe('400 KB');
    });

    it('keeps one decimal where it sits next to the limit', () => {
        expect(formatFileSize(1024 * 1024 * 1.44)).toBe('1.4 MB');
        expect(formatFileSize(1024 * 1024 * 9.5)).toBe('9.5 MB');
    });

    it('drops the decimal once the number is large enough not to need it', () => {
        expect(formatFileSize(1024 * 1024 * 14.4)).toBe('14 MB');
    });

    it('says nothing rather than something wrong for a size that is not one', () => {
        expect(formatFileSize(Number.NaN)).toBe('');
        expect(formatFileSize(-1)).toBe('');
    });
});
