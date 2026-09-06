'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The floating button.
 *
 * Only ever shown while the panel is closed — the panel's own header carries the close
 * control, so there is exactly one control with that name at any time.
 *
 * `z-40` is deliberate and load-bearing: the app's modals sit at `z-[100]` (MapModal,
 * PropertyGallery), and a support bubble drawn over an open photo gallery is a bug nobody
 * notices until they open one. Below the modals, above the page.
 */

interface SupportLauncherProps {
    unread: number;
    onOpen: () => void;
}

export function SupportLauncher({ unread, onOpen }: SupportLauncherProps) {
    const t = useTranslations('support');

    return (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
            <button
                type="button"
                onClick={onOpen}
                aria-label={t('launcherOpen')}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
                <MessageCircle className="h-6 w-6" />

                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
                        {unread}
                    </span>
                )}
            </button>
        </div>
    );
}
