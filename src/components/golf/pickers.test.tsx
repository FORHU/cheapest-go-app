import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import en from '@/locales/en.json';
import { GolfDatePicker } from './GolfDatePicker';
import { GolfSelect } from './GolfSelect';
import { GolfPlayersField } from './GolfPlayersField';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en-US',
}));

const day = (name: RegExp | string) => screen.getByRole('button', { name });

describe('GolfDatePicker', () => {
    const open = () => fireEvent.click(screen.getByRole('button', { name: /Date/ }));

    it('shows the chosen date, opens on its month and submits it through a hidden input', () => {
        const { container } = render(<GolfDatePicker label="Date" name="date" defaultValue="2026-10-20" />);
        expect(screen.getByRole('button', { name: /Date.*Oct 20, 2026/ })).toBeInTheDocument();
        expect(container.querySelector('input[name="date"]')).toHaveValue('2026-10-20');

        open();
        const dialog = screen.getByRole('dialog', { name: 'Date' });
        expect(within(dialog).getByText('October 2026')).toBeInTheDocument();
        expect(day('Tuesday, October 20, 2026')).toHaveAttribute('aria-pressed', 'true');
    });

    it('picks a day, reports it and closes', () => {
        const onChange = vi.fn();
        render(<GolfDatePicker label="Date" defaultValue="2026-10-20" onChange={onChange} />);
        open();
        fireEvent.click(day('Friday, October 23, 2026'));
        expect(onChange).toHaveBeenCalledWith('2026-10-23');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Date.*Oct 23, 2026/ })).toBeInTheDocument();
    });

    it('disables days outside the range and the month buttons that lead only to them', () => {
        render(<GolfDatePicker label="Date" defaultValue="2026-10-20" min="2026-10-14" max="2026-10-27" />);
        open();
        expect(day('Tuesday, October 13, 2026')).toBeDisabled();
        expect(day('Wednesday, October 14, 2026')).toBeEnabled();
        expect(day('Tuesday, October 27, 2026')).toBeEnabled();
        expect(day('Wednesday, October 28, 2026')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    });

    it('moves between months', () => {
        render(<GolfDatePicker label="Date" defaultValue="2026-10-20" />);
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
        expect(screen.getByText('November 2026')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        expect(screen.getByText('September 2026')).toBeInTheDocument();
    });

    it('moves by day and week with the arrow keys and closes on Escape', () => {
        render(<GolfDatePicker label="Date" defaultValue="2026-10-20" />);
        open();
        const selected = day('Tuesday, October 20, 2026');
        expect(selected).toHaveFocus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(day('Wednesday, October 21, 2026')).toHaveFocus();
        fireEvent.keyDown(day('Wednesday, October 21, 2026'), { key: 'ArrowDown' });
        expect(day('Wednesday, October 28, 2026')).toHaveFocus();
        fireEvent.keyDown(day('Wednesday, October 28, 2026'), { key: 'PageDown' });
        expect(screen.getByText('November 2026')).toBeInTheDocument();
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Date/ })).toHaveFocus();
    });

    it('clears the date when a clear action is offered', () => {
        const onChange = vi.fn();
        render(<GolfDatePicker label="Date" defaultValue="2026-10-20" onChange={onChange} clearLabel="Any date" placeholder="Any date" />);
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Any date' }));
        expect(onChange).toHaveBeenCalledWith('');
        expect(screen.getByRole('button', { name: /Date.*Any date/ })).toBeInTheDocument();
    });

    it('is controlled when given a value', () => {
        const onChange = vi.fn();
        const { rerender } = render(<GolfDatePicker label="Date" value="2026-10-20" onChange={onChange} />);
        open();
        fireEvent.click(day('Friday, October 23, 2026'));
        // The parent has not accepted the change yet, so the field still shows the old date.
        expect(screen.getByRole('button', { name: /Date.*Oct 20, 2026/ })).toBeInTheDocument();
        rerender(<GolfDatePicker label="Date" value="2026-10-23" onChange={onChange} />);
        expect(screen.getByRole('button', { name: /Date.*Oct 23, 2026/ })).toBeInTheDocument();
    });
});

describe('GolfSelect', () => {
    const options = [
        { value: '', label: 'Any time' },
        { value: '07:00', label: '07:00' },
        { value: '07:30', label: '07:30' },
        { value: '08:00', label: '08:00' },
    ];

    it('shows the chosen option and submits its value', () => {
        const { container } = render(<GolfSelect label="Earliest" name="from" defaultValue="07:30" options={options} />);
        expect(screen.getByRole('combobox', { name: 'Earliest' })).toHaveTextContent('07:30');
        expect(container.querySelector('input[name="from"]')).toHaveValue('07:30');
    });

    it('opens a listbox, marks the selected option and picks another with a click', () => {
        const onChange = vi.fn();
        render(<GolfSelect label="Earliest" defaultValue="07:30" options={options} onChange={onChange} />);
        const box = screen.getByRole('combobox', { name: 'Earliest' });
        fireEvent.click(box);
        expect(box).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('option', { name: '07:30' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('option', { name: '08:00' }));
        expect(onChange).toHaveBeenCalledWith('08:00');
        expect(box).toHaveTextContent('08:00');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('works from the keyboard: arrows to move, Enter to choose, Escape to close', () => {
        const onChange = vi.fn();
        render(<GolfSelect label="Earliest" defaultValue="07:00" options={options} onChange={onChange} />);
        const box = screen.getByRole('combobox', { name: 'Earliest' });
        fireEvent.keyDown(box, { key: 'ArrowDown' });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(box, { key: 'ArrowDown' });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('07:30');

        fireEvent.keyDown(box, { key: 'ArrowUp' });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('jumps to an option by typing its start', () => {
        const onChange = vi.fn();
        render(<GolfSelect label="Earliest" defaultValue="07:00" options={options} onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Earliest' }), { key: 'a' });
        expect(onChange).toHaveBeenCalledWith('');
    });

    it('cannot be opened when disabled, and takes an aria-label when it has no visible one', () => {
        render(<GolfSelect ariaLabel="Golf cart" disabled value="0" options={[{ value: '0', label: '0' }]} />);
        const box = screen.getByRole('combobox', { name: 'Golf cart' });
        fireEvent.click(box);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});

describe('GolfPlayersField', () => {
    it('is a radio group, so it submits with a plain form', () => {
        render(<GolfPlayersField label="Players" name="players" defaultValue={3} />);
        const group = screen.getByRole('group', { name: 'Players' });
        expect(within(group).getAllByRole('radio').map(r => (r as HTMLInputElement).value)).toEqual(['1', '2', '3', '4']);
        expect(within(group).getByRole('radio', { name: '3' })).toBeChecked();
    });

    it('reports a change when controlled', () => {
        const onChange = vi.fn();
        render(<GolfPlayersField label="Players" value={2} onChange={onChange} />);
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        expect(onChange).toHaveBeenCalledWith(4);
    });
});
