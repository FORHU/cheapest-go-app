'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { GOLF_AMENITIES, profileOfCourse, type CourseProfileInput, type GolfAmenity, type GolfCourse, type WindowImpact } from '@/lib/schemas/golf';
import type { CourseChange } from '@/lib/schemas/golfTeeSheet';
import { PhotosField } from './PhotosField';
import { cardClass, headingClass, hintClass, inputClass, labelClass, primaryButton, secondaryButton } from '../tee-sheet/shared';

type FieldErrors = Partial<Record<string, string[]>>;

/** '' → null, otherwise a number (NaN is left for the server to refuse). */
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));
const text = (value: number | string | null) => (value == null ? '' : String(value));

/**
 * A course edits its own profile (ADR-0050): description, photos, facts, and the promises it makes
 * customers. Name, place, currency and time zone are the team's and are shown, not editable.
 * Shortening the booking window is the one change asked about first.
 */
export function ProfileClient({ course, changes, courses, canUpload }: {
    course: GolfCourse;
    changes: CourseChange[];
    courses: { id: string; name: string }[];
    canUpload: boolean;
}) {
    const t = useTranslations('golf.staff.profile');
    const tAmenity = useTranslations('golf.amenities');
    const locale = useLocale();
    const router = useRouter();
    const initial = useMemo(() => profileOfCourse(course), [course]);

    const [description, setDescription] = useState(initial.description);
    const [address, setAddress] = useState(text(initial.address));
    const [amenities, setAmenities] = useState<GolfAmenity[]>(initial.amenities);
    const [imageUrls, setImageUrls] = useState(initial.imageUrls);
    const [par, setPar] = useState(text(initial.par));
    const [yardage, setYardage] = useState(text(initial.yardage));
    const [yearOpened, setYearOpened] = useState(text(initial.yearOpened));
    const [designer, setDesigner] = useState(text(initial.designer));
    const [grass, setGrass] = useState(text(initial.grass));
    const [weatherPolicy, setWeatherPolicy] = useState(initial.weatherPolicy);
    const [freeCancelHours, setFreeCancelHours] = useState(text(initial.freeCancelHours));
    const [bookingWindowDays, setBookingWindowDays] = useState(text(initial.bookingWindowDays));

    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [pageError, setPageError] = useState<string | null>(null);
    const [impact, setImpact] = useState<WindowImpact | null>(null);
    const [confirmError, setConfirmError] = useState<string | null>(null);

    const profile = useMemo(() => ({
        description, address, amenities, imageUrls,
        par: toNumber(par), yardage: toNumber(yardage), yearOpened: toNumber(yearOpened), designer, grass,
        weatherPolicy, bookingWindowDays: Number(bookingWindowDays), freeCancelHours: Number(freeCancelHours),
    }), [description, address, amenities, imageUrls, par, yardage, yearOpened, designer, grass, weatherPolicy, bookingWindowDays, freeCancelHours]);

    // Photos can be uploaded before the save, so leaving with edits in flight is worth a warning.
    const dirty = useMemo(() => {
        const before: Record<string, unknown> = { ...initial, address: initial.address ?? '', designer: initial.designer ?? '', grass: initial.grass ?? '' };
        return Object.keys(before).some(key => JSON.stringify(before[key]) !== JSON.stringify((profile as Record<string, unknown>)[key]));
    }, [initial, profile]);
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const post = useCallback(async (preview: boolean) => {
        const response = await fetch('/api/course/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
            body: JSON.stringify({ courseId: course.id, profile, ...(preview ? { preview: true } : {}) }),
        });
        const json = await response.json().catch(() => ({}));
        return { ok: response.ok, json };
    }, [course.id, profile]);

    const apply = async () => {
        setBusy(true);
        setConfirmError(null);
        try {
            const { ok, json } = await post(false);
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                setImpact(null);
                setPageError(json.error ?? t('error'));
                return;
            }
            setImpact(null);
            toast.success(t('saved'));
            router.refresh();
        } catch {
            setConfirmError(t('error'));
            setPageError(t('error'));
        } finally {
            setBusy(false);
        }
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrors({});
        setPageError(null);
        if (!(Number(bookingWindowDays) < course.bookingWindowDays)) {
            await apply();
            return;
        }
        setBusy(true);
        try {
            const { ok, json } = await post(true);
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                setPageError(json.error ?? t('error'));
                return;
            }
            setImpact(json.data.windowImpact);
        } catch {
            setPageError(t('error'));
        } finally {
            setBusy(false);
        }
    };

    const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const error = (field: string) => errors[field]?.[0]
        ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p>
        : null;
    const field = (id: string, label: string, control: React.ReactNode, hint?: string) => (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            {control}
            {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
            {error(id)}
        </div>
    );
    const details: [string, string][] = [
        [t('detailName'), course.name],
        [t('detailLocation'), [course.city, course.country].filter(Boolean).join(', ')],
        [t('detailCurrency'), course.currency],
        [t('detailTimeZone'), course.timezone ?? t('detailNone')],
    ];

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <FileText className="h-5 w-5" /> {t('title')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{course.name} · {t('subtitle')}</p>
            </header>

            {courses.length > 1 && (
                <nav aria-label={t('courseLabel')} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
                    {courses.map(c => (
                        <Link key={c.id} href={`/course/profile?course=${c.id}`}
                            aria-current={c.id === course.id ? 'page' : undefined}
                            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${c.id === course.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                            {c.name}
                        </Link>
                    ))}
                </nav>
            )}

            {pageError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {Object.keys(errors).length > 0 ? t('needsAttention') : pageError}
                </p>
            )}

            <form onSubmit={save} className="flex flex-col gap-4">
                <section aria-labelledby="profile-about" className={`${cardClass} flex flex-col gap-4`}>
                    <h2 id="profile-about" className={headingClass}>{t('aboutTitle')}</h2>
                    {field('description', t('description'), (
                        <textarea id="description" rows={6} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} />
                    ), t('descriptionHint'))}
                    {field('address', t('address'), (
                        <input id="address" className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />
                    ))}
                    <fieldset>
                        <legend className={labelClass}>{t('amenities')}</legend>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {GOLF_AMENITIES.map(code => (
                                <label key={code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                    <input type="checkbox" checked={amenities.includes(code)}
                                        onChange={e => setAmenities(current => e.target.checked ? [...current, code] : current.filter(a => a !== code))} />
                                    {tAmenity(code)}
                                </label>
                            ))}
                        </div>
                        {error('amenities')}
                    </fieldset>
                </section>

                <section aria-labelledby="profile-facts" className={cardClass}>
                    <h2 id="profile-facts" className={headingClass}>{t('factsTitle')}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                        {field('par', t('par'), <input id="par" type="number" inputMode="numeric" className={inputClass} value={par} onChange={e => setPar(e.target.value)} />)}
                        {field('yardage', t('yardage'), <input id="yardage" type="number" inputMode="numeric" className={inputClass} value={yardage} onChange={e => setYardage(e.target.value)} />)}
                        {field('yearOpened', t('yearOpened'), <input id="yearOpened" type="number" inputMode="numeric" className={inputClass} value={yearOpened} onChange={e => setYearOpened(e.target.value)} />)}
                        {field('designer', t('designer'), <input id="designer" className={inputClass} value={designer} onChange={e => setDesigner(e.target.value)} />)}
                        {field('grass', t('grass'), <input id="grass" className={inputClass} value={grass} onChange={e => setGrass(e.target.value)} />)}
                    </div>
                </section>

                <section aria-labelledby="profile-photos" className={cardClass}>
                    <h2 id="profile-photos" className={headingClass}>{t('photosTitle')}</h2>
                    <p className={`${hintClass} mb-4 mt-1`}>{t('photosHint')}</p>
                    <PhotosField urls={imageUrls} onChange={setImageUrls} courseId={course.id} canUpload={canUpload} error={errors.imageUrls?.[0]} />
                </section>

                <section aria-labelledby="profile-policies" className={`${cardClass} flex flex-col gap-4`}>
                    <h2 id="profile-policies" className={headingClass}>{t('policiesTitle')}</h2>
                    {field('weatherPolicy', t('weatherPolicy'), (
                        <textarea id="weatherPolicy" rows={3} maxLength={500} className={inputClass} value={weatherPolicy} onChange={e => setWeatherPolicy(e.target.value)} />
                    ), t('weatherPolicyHint'))}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {field('freeCancelHours', t('freeCancelHours'), (
                            <input id="freeCancelHours" type="number" min={0} max={720} className={inputClass} value={freeCancelHours} onChange={e => setFreeCancelHours(e.target.value)} />
                        ), t('freeCancelHint'))}
                        {field('bookingWindowDays', t('bookingWindowDays'), (
                            <input id="bookingWindowDays" type="number" min={1} max={90} className={inputClass} value={bookingWindowDays} onChange={e => setBookingWindowDays(e.target.value)} />
                        ), t('bookingWindowHint'))}
                    </div>
                </section>

                <div className="flex justify-end">
                    <button type="submit" disabled={busy} className={`${primaryButton} flex items-center gap-2`}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {busy ? t('saving') : t('save')}
                    </button>
                </div>
            </form>

            <section aria-labelledby="profile-details" className={cardClass}>
                <h2 id="profile-details" className={headingClass}>{t('detailsTitle')}</h2>
                <p className={`${hintClass} mt-1`}>{t('detailsHint')}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {details.map(([label, value]) => (
                        <div key={label}>
                            <dt className={labelClass}>{label}</dt>
                            <dd className="text-sm text-slate-900 dark:text-slate-100">{value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section aria-labelledby="profile-history" className={cardClass}>
                <h2 id="profile-history" className={headingClass}>{t('historyTitle')}</h2>
                {changes.length === 0 ? (
                    <p className={`${hintClass} mt-3`}>{t('historyEmpty')}</p>
                ) : (
                    <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-white/5">
                        {changes.map(change => (
                            <li key={change.id} className="py-2">
                                <p className="text-slate-900 dark:text-slate-100">{change.summary}</p>
                                <p className={hintClass}>{t('historyBy', { who: change.by ?? '—', date: stamp.format(new Date(change.createdAt)) })}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {impact && (
                <Dialog open onOpenChange={open => { if (!open && !busy) setImpact(null); }}>
                    <DialogContent role="dialog" aria-modal="true" aria-labelledby="window-title" className="p-6 sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle id="window-title">{t('windowTitle')}</DialogTitle>
                        </DialogHeader>
                        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm tabular-nums dark:divide-white/5 dark:border-white/10">
                            {impact.stopsSelling === 0 ? (
                                <li className="px-3 py-2 text-slate-500 dark:text-slate-400">{t('windowNothing')}</li>
                            ) : (
                                <>
                                    <li className="px-3 py-2 text-slate-900 dark:text-slate-100">{t('windowStops', { count: impact.stopsSelling })}</li>
                                    {impact.withBookings > 0 && (
                                        <li className="px-3 py-2 text-slate-900 dark:text-slate-100">{t('windowBookings', { count: impact.withBookings })}</li>
                                    )}
                                </>
                            )}
                        </ul>
                        <p className={`${hintClass} mt-3`}>{t('windowKeep')}</p>
                        {confirmError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{confirmError}</p>}
                        <div className="mt-6 flex justify-end gap-2">
                            <button type="button" onClick={() => setImpact(null)} disabled={busy} className={secondaryButton}>{t('cancel')}</button>
                            <button type="button" onClick={() => void apply()} disabled={busy} className={`${primaryButton} flex items-center gap-2`}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('windowConfirm')}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
