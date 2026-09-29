import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { airportName } from '@/lib/flights/airport-label';
import { searchDateLabel } from '@/lib/flights/search-date-label';
import { FlightRouteTitle, FlightSearchMeta } from '@/components/flights/FlightSearchHeading';

/**
 * The search page's heading, as the design draws it:
 *
 *   Clark International Airport to Heathrow Airport  CRK → LHR
 *   • October 1, 2026 ← October 3, 2026   • 1 adult   • Economy
 *
 * The airports named in full and in the regular weight, the codes after them in bold;
 * under it the trip's facts in grey, each behind a bullet.
 */

describe('airportName', () => {
    it('names an airport in full, without its code', () => {
        expect(airportName('CRK')).toBe('Clark International Airport');
        expect(airportName('lhr')).toBe('Heathrow Airport');
    });

    it('falls back to the code for an airport it does not know', () => {
        expect(airportName('ZZZ')).toBe('ZZZ');
    });
});

describe('searchDateLabel', () => {
    it('writes the date out in full', () => {
        expect(searchDateLabel('2026-10-01', 'en')).toBe('October 1, 2026');
    });

    it('does not shift the day with the time zone', () => {
        expect(searchDateLabel('2026-10-31', 'en')).toBe('October 31, 2026');
    });

    it('leaves an unreadable date as it came', () => {
        expect(searchDateLabel('soon', 'en')).toBe('soon');
    });
});

describe('FlightRouteTitle', () => {
    it('names the airports in the regular weight, then the codes in bold', () => {
        render(<h2><FlightRouteTitle names="Clark International Airport to Heathrow Airport" origin="crk" destination="LHR" /></h2>);
        const heading = screen.getByRole('heading');
        expect(heading).toHaveTextContent('Clark International Airport to Heathrow Airport CRK → LHR');
        expect(screen.getByText('Clark International Airport to Heathrow Airport')).toHaveClass('font-normal');
        expect(screen.getByText('CRK → LHR')).toHaveClass('font-bold');
    });
});

describe('FlightSearchMeta', () => {
    it('puts each fact behind a bullet, in order', () => {
        render(<FlightSearchMeta items={['October 1, 2026 ← October 3, 2026', '1 adult', 'Economy']} />);
        const items = screen.getAllByRole('listitem');
        expect(items.map(i => i.textContent)).toEqual([
            '• October 1, 2026 ← October 3, 2026',
            '• 1 adult',
            '• Economy',
        ]);
    });

    it('drops an empty fact rather than showing a lone bullet', () => {
        render(<FlightSearchMeta items={['October 1, 2026', '', '1 adult']} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
});
