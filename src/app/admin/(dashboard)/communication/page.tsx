import { getEmailLogs } from '@/lib/server/admin/communication';
import { CommunicationClient } from './CommunicationClient';

export const dynamic = 'force-dynamic';

export default async function AdminCommunicationPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedParams = await searchParams;
    const page = typeof resolvedParams.page === 'string' ? parseInt(resolvedParams.page) : 1;
    const bookingId = typeof resolvedParams.bookingId === 'string' ? resolvedParams.bookingId : undefined;
    const status = typeof resolvedParams.status === 'string' ? resolvedParams.status : undefined;
    const type = typeof resolvedParams.type === 'string' ? resolvedParams.type : undefined;

    const data = await getEmailLogs({
        page,
        bookingId,
        status,
        type
    });

    return (
        <CommunicationClient data={data} />
    );
}
