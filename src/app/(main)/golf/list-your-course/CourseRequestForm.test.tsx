import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import en from '@/locales/en.json';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

import { CourseRequestForm } from './CourseRequestForm';

const listed = [{ id: '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44', name: 'Wack Wack East', city: 'Manila', country: 'Philippines' }];
const fetchMock = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 'r1', status: 'pending' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
});

const form = () => render(<CourseRequestForm defaultName="Ana Cruz" email="ana@club.test" courses={listed} />);
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('CourseRequestForm', () => {
    it('says which account the request comes from', () => {
        form();
        expect(screen.getByText(/ana@club\.test/)).toBeInTheDocument();
        expect(screen.getByLabelText('Your name')).toHaveValue('Ana Cruz');
    });

    it('sends a new listing with no existing course', async () => {
        form();
        type('Course name', 'New Greens');
        type('Country', 'Philippines');
        type('City', 'Cebu');
        type(/Anything we should know/, 'I run the pro shop.');
        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/golf/course-requests');
        expect(JSON.parse(String(init.body))).toEqual({
            contactName: 'Ana Cruz', courseName: 'New Greens', country: 'Philippines', city: 'Cebu',
            message: 'I run the pro shop.', existingCourseId: null,
        });
        expect(await screen.findByRole('status')).toHaveTextContent('Request sent.');
    });

    it('fills and locks the course details when claiming a listed course', async () => {
        form();
        fireEvent.click(screen.getByRole('combobox', { name: 'Is your course already listed?' }));
        fireEvent.click(screen.getByRole('option', { name: /Wack Wack East/ }));

        expect(screen.getByLabelText('Course name')).toHaveValue('Wack Wack East');
        expect(screen.getByLabelText('Course name')).toBeDisabled();
        expect(screen.getByLabelText('City')).toHaveValue('Manila');

        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)))
            .toMatchObject({ existingCourseId: listed[0].id, courseName: 'Wack Wack East' });
    });

    it('shows the server\'s message when a request is already waiting', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ success: false, error: 'You already have a request waiting.', code: 'request_pending' }), { status: 409 }));
        form();
        type('Course name', 'New Greens');
        type('Country', 'Philippines');
        type('City', 'Cebu');
        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('You already have a request waiting.');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
