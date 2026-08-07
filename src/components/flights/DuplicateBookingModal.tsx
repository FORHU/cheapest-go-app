"use client";

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/Dialog';

export interface DuplicateBookingModalProps {
    /** Present when the server's duplicate guard rejected this attempt. */
    data: { existingBookingId: string; route: string; departureDate: string } | null;
    /** "Keep existing booking" — dismisses and leaves the traveller on the form. */
    onKeep: () => void;
    /** "View existing booking" — navigates to the clashing booking. */
    onView: (bookingId: string) => void;
}

/**
 * Shown when /api/flights/book answers DUPLICATE_BOOKING.
 *
 * A modal rather than the inline banner it replaces: the server has already
 * refused the booking, so this is a decision point, not an advisory. The form
 * behind it cannot be submitted until one of the two options is taken.
 *
 * Deliberately NOT styled as an error. Holding a booking for that day is a
 * normal state — often the traveller simply forgot — so the red alert treatment
 * overstated it. The two actions are given equal visual weight because either is
 * a reasonable outcome; only "view existing" is accented, as it is the one that
 * tells them something they may not know.
 *
 * No close button (`showCloseButton={false}`): dismissing without choosing would
 * leave the traveller staring at a form that will refuse them again on submit.
 */
export function DuplicateBookingModal({ data, onKeep, onView }: DuplicateBookingModalProps) {
    const t = useTranslations('flightBook');

    return (
        <Dialog open={!!data} onOpenChange={(open) => { if (!open) onKeep(); }}>
            <DialogContent
                showCloseButton={false}
                className="max-w-[420px] rounded-[18px] border-slate-200/60 dark:border-white/10 shadow-[0_20px_25px_-5px_rgba(15,23,42,0.10)]"
                role="alertdialog"
                aria-modal="true"
            >
                <div className="flex flex-col gap-5 p-6">
                    <div className="flex flex-col gap-2">
                        <h2 className="font-display text-[20px] leading-[1.25] tracking-[-0.02em] font-semibold text-slate-900 dark:text-white">
                            {t('duplicate.title')}
                        </h2>
                        <p className="text-[14px] leading-[1.55] text-slate-600 dark:text-slate-400 text-pretty">
                            {/* Route and date are rendered monospaced so the two facts the
                                traveller needs to recognise stand out from the sentence. */}
                            {t.rich('duplicate.description', {
                                route: data?.route ?? '',
                                date: data?.departureDate ?? '',
                                mono: (chunks) => <span className="font-mono">{chunks}</span>,
                            })}
                        </p>
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            type="button"
                            onClick={onKeep}
                            className="flex-1 h-11 rounded-[14px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[14px] font-regular transition-all duration-150 hover:bg-slate-50 dark:hover:bg-slate-700 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20"
                        >
                            {t('duplicate.keepExisting')}
                        </button>
                        <button
                            type="button"
                            onClick={() => data && onView(data.existingBookingId)}
                            className="flex-1 h-11 rounded-[14px] bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-regular shadow-[0_10px_20px_-8px_rgba(37,99,235,0.4)] transition-all duration-150 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20"
                        >
                            {t('duplicate.viewExisting')}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default DuplicateBookingModal;
