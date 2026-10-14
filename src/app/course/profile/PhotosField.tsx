'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Loader2, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { dangerButton, hintClass, inputClass, labelClass, secondaryButton } from '../tee-sheet/shared';

/** What the portal's profile lets a course keep (the server enforces the same ceiling). */
const MAX_PHOTOS = 20;

/**
 * A course's photos: paste a link or upload a file, reorder, remove. The first one is the cover.
 * An upload is stored at once but only becomes public when the profile is saved with it.
 */
export function PhotosField({ urls, onChange, courseId, canUpload, error }: {
    urls: string[];
    onChange: (urls: string[]) => void;
    courseId: string;
    canUpload: boolean;
    error?: string;
}) {
    const t = useTranslations('golf.staff.profile');
    const [link, setLink] = useState('');
    const [linkError, setLinkError] = useState(false);
    const [uploading, setUploading] = useState(0);
    const [failures, setFailures] = useState<string[]>([]);

    const full = urls.length >= MAX_PHOTOS;

    const move = (index: number, by: -1 | 1) => {
        const next = [...urls];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        onChange(next);
    };

    const addLink = () => {
        const value = link.trim();
        if (!value) return;
        if (!value.startsWith('https://')) {
            setLinkError(true);
            return;
        }
        setLinkError(false);
        setLink('');
        onChange([...urls, value]);
    };

    const upload = async (files: File[]) => {
        setFailures([]);
        // One at a time: each is a multipart body held in memory on the server.
        let added = [...urls];
        for (const file of files) {
            if (added.length >= MAX_PHOTOS) break;
            setUploading(n => n + 1);
            try {
                const form = new FormData();
                form.set('courseId', courseId);
                form.set('file', file);
                const response = await fetch('/api/course/profile/photos', {
                    method: 'POST', headers: { 'X-Requested-By': 'cheapestgo-client' }, body: form,
                });
                const json = await response.json().catch(() => ({}));
                if (response.ok && json.data?.url) {
                    added = [...added, json.data.url as string];
                    onChange(added);
                } else {
                    setFailures(f => [...f, t('uploadFailed', { name: file.name, reason: json.error ?? t('error') })]);
                }
            } catch {
                setFailures(f => [...f, t('uploadFailed', { name: file.name, reason: t('error') })]);
            } finally {
                setUploading(n => n - 1);
            }
        }
    };

    return (
        <div>
            {urls.length === 0 ? (
                <p className={hintClass}>{t('photosEmpty')}</p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {urls.map((url, index) => (
                        <li key={`${url}-${index}`} data-photo={index} className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                            <div className="relative aspect-[4/3] bg-slate-100 dark:bg-white/5">
                                <Image src={url} alt={t('photoAlt', { number: index + 1 })} fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
                                {index === 0 && (
                                    <span className="absolute left-2 top-2 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">{t('cover')}</span>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-1 p-1.5">
                                <div className="flex gap-1">
                                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)}
                                        aria-label={t('moveEarlier')} title={t('moveEarlier')} className={`${secondaryButton} px-2`}>
                                        <ArrowLeft className="h-4 w-4" aria-hidden />
                                    </button>
                                    <button type="button" disabled={index === urls.length - 1} onClick={() => move(index, 1)}
                                        aria-label={t('moveLater')} title={t('moveLater')} className={`${secondaryButton} px-2`}>
                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                    </button>
                                </div>
                                <button type="button" onClick={() => onChange(urls.filter((_, i) => i !== index))}
                                    aria-label={t('remove')} title={t('remove')} className={`${dangerButton} px-2`}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3">
                {canUpload && (
                    <label className={`${secondaryButton} flex cursor-pointer items-center gap-2 ${full ? 'pointer-events-none opacity-50' : ''}`}>
                        {uploading > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                        <span>{t('upload')}</span>
                        <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={full}
                            onChange={event => {
                                const files = Array.from(event.target.files ?? []);
                                event.target.value = '';
                                if (files.length > 0) void upload(files);
                            }} />
                    </label>
                )}

                <div className="flex min-w-[16rem] flex-1 items-end gap-2">
                    <div className="flex-1">
                        <label htmlFor="photo-link" className={labelClass}>{t('urlLabel')}</label>
                        <input id="photo-link" type="url" inputMode="url" className={inputClass} placeholder={t('urlPlaceholder')}
                            value={link} disabled={full}
                            onChange={e => { setLink(e.target.value); setLinkError(false); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
                    </div>
                    <button type="button" onClick={addLink} disabled={full || link.trim() === ''} className={secondaryButton}>{t('add')}</button>
                </div>
            </div>

            {uploading > 0 && <p role="status" className={`${hintClass} mt-2`}>{t('uploading')}</p>}
            {linkError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{t('urlInvalid')}</p>}
            {failures.map(message => (
                <p key={message} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{message}</p>
            ))}
            {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
