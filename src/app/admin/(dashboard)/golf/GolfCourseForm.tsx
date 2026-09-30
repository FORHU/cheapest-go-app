'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
    GOLF_AMENITIES, GOLF_HOLES, slugify,
    type GolfAmenity, type GolfCourse, type GolfCourseInputRaw,
} from '@/lib/schemas/golf';

export type FieldErrors = Partial<Record<string, string[]>>;

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
export const AMENITY_LABELS: Record<GolfAmenity, string> = {
    caddie: 'Caddie', cart: 'Golf cart', driving_range: 'Driving range', putting_green: 'Putting green',
    clubhouse: 'Clubhouse', restaurant: 'Restaurant', club_rental: 'Club rental', pro_shop: 'Pro shop',
    lessons: 'Lessons', night_golf: 'Night golf',
};

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

/** '' → null, otherwise a number (NaN is left for the server to refuse). */
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));

export function GolfCourseForm({
    initial,
    onSubmit,
    onCancel,
}: {
    initial?: GolfCourse;
    /** Resolves with field errors to show, or nothing when saved. */
    onSubmit: (course: GolfCourseInputRaw) => Promise<{ fieldErrors?: FieldErrors } | void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [country, setCountry] = useState(initial?.country ?? '');
    const [city, setCity] = useState(initial?.city ?? '');
    // An existing course keeps its slug: changing it breaks every link already shared.
    const [slug, setSlug] = useState(initial?.slug ?? '');
    const [slugTouched, setSlugTouched] = useState(Boolean(initial));
    const [address, setAddress] = useState(initial?.address ?? '');
    const [holes, setHoles] = useState(String(initial?.holes ?? 18));
    const [par, setPar] = useState(initial?.par != null ? String(initial.par) : '');
    const [greenFee, setGreenFee] = useState(initial?.greenFeeFrom != null ? String(initial.greenFeeFrom) : '');
    const [currency, setCurrency] = useState(initial?.currency ?? 'USD');
    const [images, setImages] = useState((initial?.imageUrls ?? []).join('\n'));
    const [amenities, setAmenities] = useState<GolfAmenity[]>(initial?.amenities ?? []);
    const [description, setDescription] = useState(initial?.description ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);

    const shownSlug = slugTouched ? slug : slugify(name, city);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            const result = await onSubmit({
                name, country, city, slug: shownSlug, address, description,
                holes: Number(holes), par: toNumber(par), greenFeeFrom: toNumber(greenFee), currency,
                imageUrls: images.split('\n').map(line => line.trim()).filter(Boolean),
                amenities,
            });
            if (result?.fieldErrors) setErrors(result.fieldErrors);
        } finally {
            setSaving(false);
        }
    };

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;

    const field = (id: string, label: string, control: React.ReactNode, hint?: string) => (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
            {control}
            {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
            {error(id)}
        </div>
    );

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
                {field('name', 'Name', <input id="name" className={inputClass} value={name} onChange={e => setName(e.target.value)} />)}
                {field('slug', 'Slug', (
                    <input id="slug" className={`${inputClass} font-mono`} value={shownSlug}
                        onChange={e => { setSlugTouched(true); setSlug(e.target.value); }} />
                ), 'The course page address: /golf/<slug>')}
                {field('country', 'Country', <input id="country" className={inputClass} value={country} onChange={e => setCountry(e.target.value)} />)}
                {field('city', 'City', <input id="city" className={inputClass} value={city} onChange={e => setCity(e.target.value)} />)}
            </div>

            {field('address', 'Address', <input id="address" className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />)}

            <div className="grid gap-4 sm:grid-cols-4">
                {field('holes', 'Holes', (
                    <select id="holes" className={inputClass} value={holes} onChange={e => setHoles(e.target.value)}>
                        {GOLF_HOLES.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                ))}
                {field('par', 'Par', <input id="par" type="number" inputMode="numeric" className={inputClass} value={par} onChange={e => setPar(e.target.value)} />)}
                {field('greenFeeFrom', 'Green fee from', <input id="greenFeeFrom" type="number" min="0" step="0.01" className={inputClass} value={greenFee} onChange={e => setGreenFee(e.target.value)} />, 'Indicative, not a quote')}
                {field('currency', 'Currency', <input id="currency" maxLength={3} className={`${inputClass} uppercase`} value={currency} onChange={e => setCurrency(e.target.value)} />)}
            </div>

            <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Amenities</legend>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {GOLF_AMENITIES.map(code => (
                        <label key={code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input type="checkbox" checked={amenities.includes(code)}
                                onChange={e => setAmenities(current => e.target.checked ? [...current, code] : current.filter(a => a !== code))} />
                            {AMENITY_LABELS[code]}
                        </label>
                    ))}
                </div>
                {error('amenities')}
            </fieldset>

            {field('imageUrls', 'Image URLs', (
                <textarea id="imageUrls" rows={3} className={`${inputClass} font-mono text-xs`} value={images} onChange={e => setImages(e.target.value)} />
            ), 'One https:// URL per line. The first is the cover.')}

            {field('description', 'Description', (
                <textarea id="description" rows={6} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} />
            ), 'Plain text. Leave a blank line between paragraphs.')}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
            </div>
        </form>
    );
}
