import type { Metadata } from 'next';
import CronsClient from './CronsClient';

export const metadata: Metadata = {
    title: 'Cron Jobs | Admin',
    robots: { index: false, follow: false },
};

export default function CronsPage() {
    return <CronsClient />;
}
