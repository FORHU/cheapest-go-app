'use client';

import { usePathname } from 'next/navigation';
import { DeskNav } from './DeskNav';
import { useSupportWaiting } from '@/components/admin/useSupportWaiting';

/**
 * The desk's chrome: a short nav beside whatever page is open.
 *
 * A client component only because the nav needs the current path and the live queue count.
 */
export function DeskShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const waiting = useSupportWaiting();

    return (
        <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
            <div className="mx-auto flex max-w-350 gap-6 px-4 py-6 sm:px-6">
                <aside className="w-48 shrink-0">
                    <p className="mb-4 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Support desk
                    </p>
                    <DeskNav pathname={pathname} waiting={waiting} />
                </aside>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
