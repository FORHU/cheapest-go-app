'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GolfSelect } from '@/components/golf/GolfSelect';

export interface ListedCourse {
    id: string;
    name: string;
    city: string;
    country: string;
}

type FieldErrors = Record<string, string[] | undefined>;

const inputClass =
    'mt-1 w-full rounded-none border-0 border-b border-g-rule bg-transparent px-0 py-2 text-base text-g-ink transition-colors placeholder:text-g-muted/60 focus:border-g-accent focus:outline-none disabled:text-g-muted';

/** Asks to list a new course, or to claim one that is already on the site. */
export function CourseRequestForm({ defaultName, email, courses }: {
    defaultName: string;
    email: string;
    courses: ListedCourse[];
}) {
    const t = useTranslations('golf.staff.request');
    const [claimId, setClaimId] = useState('');
    const [contactName, setContactName] = useState(defaultName);
    const [courseName, setCourseName] = useState('');
    const [country, setCountry] = useState('');
    const [city, setCity] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [sent, setSent] = useState(false);

    const claimed = courses.find(c => c.id === claimId);

    const choose = (id: string) => {
        setClaimId(id);
        const found = courses.find(c => c.id === id);
        if (found) {
            setCourseName(found.name);
            setCountry(found.country);
            setCity(found.city);
        }
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const response = await fetch('/api/golf/course-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ contactName, courseName, country, city, message, existingCourseId: claimId || null }),
            });
            if (response.ok) {
                setSent(true);
                return;
            }
            const json = await response.json().catch(() => ({}));
            if (json.fieldErrors) setFieldErrors(json.fieldErrors);
            setError(json.error ?? t('error'));
        } catch {
            setError(t('error'));
        } finally {
            setBusy(false);
        }
    };

    if (sent) {
        return (
            <div role="status" className="border-l-2 border-g-accent bg-g-sunk px-4 py-4">
                <p className="font-medium text-g-ink">{t('sentTitle')}</p>
                <p className="mt-1 text-sm text-g-muted">{t('pendingBody', { email })}</p>
            </div>
        );
    }

    const label = 'block text-xs font-medium text-g-muted';
    const err = (field: string) =>
        fieldErrors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors[field]![0]}</p> : null;

    return (
        <form onSubmit={submit} className="flex flex-col gap-6">
            <p className="text-sm text-g-muted">{t('fromAccount', { email })}</p>

            <GolfSelect
                label={t('listedLabel')}
                value={claimId}
                onChange={choose}
                options={[
                    { value: '', label: t('notListed') },
                    ...courses.map(c => ({ value: c.id, label: `${c.name} — ${c.city}, ${c.country}` })),
                ]}
            />

            <label className={label}>
                {t('yourName')}
                <input className={inputClass} value={contactName} onChange={e => setContactName(e.target.value)} autoComplete="name" required maxLength={120} />
                {err('contactName')}
            </label>

            <label className={label}>
                {t('courseName')}
                <input className={inputClass} value={courseName} onChange={e => setCourseName(e.target.value)} disabled={Boolean(claimed)} required maxLength={120} />
                {err('courseName')}
            </label>

            <div className="grid gap-6 sm:grid-cols-2">
                <label className={label}>
                    {t('country')}
                    <input className={inputClass} value={country} onChange={e => setCountry(e.target.value)} disabled={Boolean(claimed)} required maxLength={80} />
                    {err('country')}
                </label>
                <label className={label}>
                    {t('city')}
                    <input className={inputClass} value={city} onChange={e => setCity(e.target.value)} disabled={Boolean(claimed)} required maxLength={80} />
                    {err('city')}
                </label>
            </div>

            <label className={label}>
                {t('message')}
                <textarea className={`${inputClass} resize-y`} rows={4} value={message} onChange={e => setMessage(e.target.value)}
                    maxLength={1000} placeholder={t('messagePlaceholder')} />
                {err('message')}
            </label>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div>
                <button type="submit" disabled={busy}
                    className="flex items-center gap-2 rounded-sm bg-g-accent px-6 py-3 text-base font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover disabled:opacity-60 motion-safe:active:scale-[0.98]">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('send')}
                </button>
            </div>
        </form>
    );
}
