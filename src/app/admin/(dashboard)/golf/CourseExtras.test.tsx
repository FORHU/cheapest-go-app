import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CourseExtras } from './CourseExtras';

const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    new Response(JSON.stringify(init?.method === 'POST'
        ? { success: true, data: JSON.parse(String(init.body)).extras }
        : { success: true, data: [{ code: 'caddie', price: 30 }] })));

beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
});

describe('CourseExtras', () => {
    it('shows what the course offers and saves the new offer', async () => {
        render(<CourseExtras courseId="c1" currency="USD" />);
        expect(await screen.findByLabelText('Offer Caddie')).toBeChecked();
        expect(screen.getByLabelText('Caddie price')).toHaveValue(30);

        fireEvent.click(screen.getByLabelText('Offer Golf cart'));
        fireEvent.change(screen.getByLabelText('Golf cart price'), { target: { value: '25' } });
        fireEvent.click(screen.getByRole('button', { name: /save extras/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const [, init] = fetchMock.mock.calls[1];
        expect(JSON.parse(String(init?.body))).toEqual({
            courseId: 'c1', extras: [{ code: 'caddie', price: 30 }, { code: 'cart', price: 25 }],
        });
    });
});
