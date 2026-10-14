import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import en from '@/locales/en.json';
import type { GolfCourse } from '@/lib/schemas/golf';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en-GB',
}));

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { ProfileClient } from './ProfileClient';

const COURSE = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const PHOTO = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';

const course = (over: Partial<GolfCourse> = {}): GolfCourse => ({
    id: COURSE, slug: 'mine-gc', name: 'Mine GC', country: 'Philippines', city: 'Cebu', address: '1 Fairway Road',
    description: 'A links course.', holes: 18, par: 72, greenFeeFrom: 50, currency: 'PHP',
    imageUrls: ['https://cdn.example.com/a.jpg', `/golf-photos/${PHOTO}`], amenities: ['cart'], status: 'published',
    timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: 'Play on in light rain.',
    yardage: 6800, yearOpened: 1998, designer: 'A. Architect', grass: 'Bermuda', ...over,
});

const noWindow = { stopsSelling: 0, withBookings: 0 };
const saved = (over: Record<string, unknown> = {}) =>
    ({ ok: true, json: async () => ({ success: true, data: { preview: false, changes: {}, windowImpact: noWindow, created: 0, ...over } }) });

const fetchMock = vi.fn();
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit }));
const bodyOf = (index: number) => JSON.parse(String(calls()[index].init.body));

function setup(props: Partial<React.ComponentProps<typeof ProfileClient>> = {}) {
    return render(
        <ProfileClient course={course()} changes={[]} courses={[{ id: COURSE, name: 'Mine GC' }]} canUpload {...props} />,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

describe('ProfileClient', () => {
    it('shows the course\'s profile and keeps the team\'s fields read-only', () => {
        setup();
        expect(screen.getByLabelText('Description')).toHaveValue('A links course.');
        expect(screen.getByLabelText('Par')).toHaveValue(72);
        expect(screen.getByLabelText('Weather rule')).toHaveValue('Play on in light rain.');
        expect(screen.getByLabelText(/Booking window/)).toHaveValue(60);

        const details = screen.getByRole('region', { name: 'Course details' });
        expect(within(details).getByText('Mine GC')).toBeInTheDocument();
        expect(within(details).getByText('Asia/Manila')).toBeInTheDocument();
        expect(within(details).queryByRole('textbox')).toBeNull();
    });

    it('saves every editable field, and only those, without a preview when the window is unchanged', async () => {
        fetchMock.mockResolvedValueOnce(saved());
        setup();
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New words.' } });
        fireEvent.change(screen.getByLabelText('Par'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(calls()[0].url).toBe('/api/course/profile');
        expect(bodyOf(0)).toEqual({
            courseId: COURSE,
            profile: {
                description: 'New words.', address: '1 Fairway Road', amenities: ['cart'],
                imageUrls: ['https://cdn.example.com/a.jpg', `/golf-photos/${PHOTO}`],
                par: null, yardage: 6800, yearOpened: 1998, designer: 'A. Architect', grass: 'Bermuda',
                weatherPolicy: 'Play on in light rain.', bookingWindowDays: 60, freeCancelHours: 48,
            },
        });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile saved.'));
        expect(router.refresh).toHaveBeenCalled();
    });

    it('shows the server\'s field errors under the field', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ success: false, error: 'Some fields need attention', fieldErrors: { weatherPolicy: ['At most 500 characters'] } }),
        });
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('At most 500 characters')).toBeInTheDocument();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('asks before shortening the window, with the impact, then saves for real', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { preview: true, changes: {}, windowImpact: { stopsSelling: 14, withBookings: 2 }, created: 0 } }) })
            .mockResolvedValueOnce(saved());
        setup();
        fireEvent.change(screen.getByLabelText(/Booking window/), { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        const dialog = await screen.findByRole('dialog');
        expect(bodyOf(0).preview).toBe(true);
        expect(within(dialog).getByText('Open tee times that will stop being sold: 14')).toBeInTheDocument();
        expect(within(dialog).getByText(/with a booking: 2/)).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Shorten and save' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(bodyOf(1).preview).toBeUndefined();
        expect(bodyOf(1).profile.bookingWindowDays).toBe(30);
    });

    it('does not save when the shortened-window dialog is cancelled', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { preview: true, changes: {}, windowImpact: noWindow, created: 0 } }) });
        setup();
        fireEvent.change(screen.getByLabelText(/Booking window/), { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('No open tee times are beyond the new window.')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lists recent changes', () => {
        setup({ changes: [{ id: 'c1', kind: 'profile_updated', summary: 'Changed description, photos', by: 'Ana Cruz', createdAt: '2030-01-02T10:00:00.000Z' }] });
        expect(screen.getByText('Changed description, photos')).toBeInTheDocument();
        expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
    });
});

describe('photos', () => {
    const photoList = () => screen.getAllByRole('listitem').filter(li => li.getAttribute('data-photo') !== null);

    it('marks the first photo as the cover', () => {
        setup();
        expect(photoList()).toHaveLength(2);
        expect(within(photoList()[0]).getByText('Cover')).toBeInTheDocument();
        expect(within(photoList()[1]).queryByText('Cover')).toBeNull();
    });

    it('reorders, so the cover changes', async () => {
        fetchMock.mockResolvedValueOnce(saved());
        setup();
        fireEvent.click(within(photoList()[1]).getByRole('button', { name: 'Move earlier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(bodyOf(0).profile.imageUrls).toEqual([`/golf-photos/${PHOTO}`, 'https://cdn.example.com/a.jpg']);
    });

    it('removes a photo', async () => {
        fetchMock.mockResolvedValueOnce(saved());
        setup();
        fireEvent.click(within(photoList()[0]).getByRole('button', { name: 'Remove' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(bodyOf(0).profile.imageUrls).toEqual([`/golf-photos/${PHOTO}`]);
    });

    it('adds a photo by link', async () => {
        fetchMock.mockResolvedValueOnce(saved());
        setup();
        fireEvent.change(screen.getByLabelText('Photo link'), { target: { value: 'https://cdn.example.com/b.jpg' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(photoList()).toHaveLength(3);
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(bodyOf(0).profile.imageUrls).toHaveLength(3);
    });

    it('refuses a link that is not https, adding nothing', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Photo link'), { target: { value: 'http://cdn.example.com/b.jpg' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(screen.getByText('Use a link that starts with https://')).toBeInTheDocument();
        expect(photoList()).toHaveLength(2);
    });

    it('uploads a file and adds the path it gets back', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 'p9', url: '/golf-photos/p9' } }) });
        setup();
        const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'tee.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Upload photos'), { target: { files: [file] } });

        await waitFor(() => expect(photoList()).toHaveLength(3));
        expect(calls()[0].url).toBe('/api/course/profile/photos');
        const form = calls()[0].init.body as FormData;
        expect(form.get('courseId')).toBe(COURSE);
        expect((form.get('file') as File).name).toBe('tee.jpg');
        expect(within(photoList()[2]).getByRole('img')).toHaveAttribute('src', '/golf-photos/p9');
    });

    it('says why an upload was refused and adds nothing', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'Use a JPEG, PNG or WebP image.' }) });
        setup();
        const file = new File(['<html>'], 'x.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Upload photos'), { target: { files: [file] } });
        expect(await screen.findByText('Could not upload x.jpg: Use a JPEG, PNG or WebP image.')).toBeInTheDocument();
        expect(photoList()).toHaveLength(2);
    });

    it('offers links only when uploads are not available', () => {
        setup({ canUpload: false });
        expect(screen.queryByLabelText('Upload photos')).toBeNull();
        expect(screen.getByLabelText('Photo link')).toBeInTheDocument();
    });
});
