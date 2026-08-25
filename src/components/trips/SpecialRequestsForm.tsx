'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api/client';

interface SpecialRequestsFormProps {
    bookingId: string;
    dbId: string;
    firstName: string;
    lastName: string;
    email: string;
    initialRemarks: string;
}

export default function SpecialRequestsForm({ bookingId, dbId, firstName, lastName, email, initialRemarks }: SpecialRequestsFormProps) {
    const router = useRouter();
    const [remarks, setRemarks] = useState(initialRemarks);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        setSaved(false);

        const result = await apiFetch('/api/booking/amend', {
            bookingId,
            firstName,
            lastName,
            email,
            remarks: remarks.trim(),
        });

        setIsSaving(false);
        if (result.success) {
            setSaved(true);
            router.refresh();
        } else {
            setError(result.error || 'Failed to save your request. Please try again.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
                <label htmlFor="remarks" className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80 ml-1">
                    Message to the property
                </label>
                <textarea
                    id="remarks"
                    value={remarks}
                    onChange={(e) => { setRemarks(e.target.value); setSaved(false); }}
                    rows={5}
                    maxLength={1000}
                    placeholder="e.g. Late check-in after 10 PM, extra bed, high floor…"
                    className="flex w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all dark:border-white/10 dark:bg-white/5 dark:placeholder:text-slate-500 resize-none"
                />
            </div>

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {saved && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={15} /> Saved — the property has been notified.
                </p>
            )}

            <Button type="submit" isLoading={isSaving} fullWidth>
                Save request
            </Button>
        </form>
    );
}
