import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canStaffSupport } from '@/lib/auth/roles';
import { getSupportHours } from '@/lib/server/support/availability';
import { SupportHoursForm, type HoursValue } from './SupportHoursForm';

export const dynamic = 'force-dynamic';

/** The desk's settings: when the team is available, and nothing else. */
export default async function DeskSettingsPage() {
    const { user } = await getSession();
    if (!user || !canStaffSupport(user.role)) redirect('/');

    return <SupportHoursForm initialHours={(await getSupportHours()) as HoursValue} />;
}
