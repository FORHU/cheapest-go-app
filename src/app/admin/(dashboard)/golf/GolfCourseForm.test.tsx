import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GolfCourseForm } from './GolfCourseForm';

const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('GolfCourseForm', () => {
    it('fills the slug from name and city until the admin edits it', () => {
        render(<GolfCourseForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack East');
        type(/^city/i, 'Manila');
        expect(screen.getByLabelText(/^slug/i)).toHaveValue('wack-wack-east-manila');

        type(/^slug/i, 'wack-east');
        type(/^name/i, 'Wack Wack West');
        expect(screen.getByLabelText(/^slug/i)).toHaveValue('wack-east');
    });

    it('sends numbers as numbers, one image per line and the ticked amenities', async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(<GolfCourseForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack');
        type(/^country/i, 'Philippines');
        type(/^city/i, 'Manila');
        type(/^par/i, '72');
        type(/green fee from/i, '');
        type(/image urls/i, 'https://a.test/1.jpg\n\n https://a.test/2.jpg ');
        fireEvent.click(screen.getByLabelText('Caddie'));
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect((onSubmit.mock.calls[0] as unknown[])[0]).toMatchObject({
            name: 'Wack Wack', holes: 18, par: 72, greenFeeFrom: null,
            imageUrls: ['https://a.test/1.jpg', 'https://a.test/2.jpg'], amenities: ['caddie'],
            slug: 'wack-wack-manila',
        });
    });

    it('shows the errors the server returned beside their fields', async () => {
        render(<GolfCourseForm onSubmit={async () => ({ fieldErrors: { slug: ['Another course already uses this slug'] } })} onCancel={vi.fn()} />);
        type(/^name/i, 'X');
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(await screen.findByText('Another course already uses this slug')).toBeInTheDocument();
    });

    it('sends the time zone and free-cancellation hours', async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(<GolfCourseForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack');
        type(/^country/i, 'Philippines');
        type(/^city/i, 'Manila');
        type(/^time zone/i, 'Asia/Manila');
        type(/^free cancellation/i, '72');
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect((onSubmit.mock.calls[0] as unknown[])[0]).toMatchObject({ timezone: 'Asia/Manila', freeCancelHours: 72 });
    });
});
