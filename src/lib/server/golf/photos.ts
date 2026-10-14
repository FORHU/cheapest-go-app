import { getSqlAdmin } from '@/lib/db/postgres';
import { golfPhotoPath } from '@/lib/schemas/golf';
import { attachmentsConfigured, deleteObject, getObject, putObject } from '@/lib/server/storage/s3';
import { sniffContentType } from '@/lib/server/support/attachments';
import { PhotoRejectedError } from './errors';

/**
 * A course's own uploaded photos (ADR-0050). The bytes are private in the bucket under `golf/`
 * and reach customers only through `/golf-photos/<id>`, so the bucket's one access rule from
 * ADR-0040 holds for photos too.
 */

/** Photos go through the app process on their way to the bucket, so the ceiling is on memory. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Rows held per course, counted across everything uploaded, whether or not it is on the page. */
export const MAX_PHOTOS_PER_COURSE = 30;

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
type PhotoType = keyof typeof EXTENSION;

/** What the bytes are, not what the browser called them; null when it is not a photo we serve. */
function photoType(bytes: Buffer): PhotoType | null {
    const type = sniffContentType(bytes);
    return type && type in EXTENSION ? (type as PhotoType) : null;
}

/** Whether uploads can be stored here; when not, the page offers links only. */
export const photosConfigured = attachmentsConfigured;

export interface StoredPhoto {
    id: string;
    /** The path to put in the course's image list. */
    url: string;
}

/**
 * Checks, stores and records one photo. The object goes in before the row, so a row never names
 * a missing file; if the row cannot be written the object is removed again.
 */
export async function storePhoto(
    { courseId, userId, bytes }: { courseId: string; userId: string | null; bytes: Buffer },
): Promise<StoredPhoto> {
    if (bytes.length === 0) throw new PhotoRejectedError('empty');
    if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoRejectedError('too_large');
    const type = photoType(bytes);
    if (!type) throw new PhotoRejectedError('unsupported_type');

    const sql = getSqlAdmin();
    const [{ held }] = await sql<{ held: number }[]>`
        SELECT count(*)::int AS held FROM golf_course_photos WHERE course_id = ${courseId}`;
    if (held >= MAX_PHOTOS_PER_COURSE) throw new PhotoRejectedError('too_many');

    const id = crypto.randomUUID();
    const key = `golf/${courseId}/${id}.${EXTENSION[type]}`;
    await putObject({ key, body: bytes, contentType: type });
    try {
        await sql`
            INSERT INTO golf_course_photos (id, course_id, storage_key, content_type, size_bytes, created_by)
            VALUES (${id}, ${courseId}, ${key}, ${type}, ${bytes.length}, ${userId})`;
    } catch (err) {
        await deleteObject(key).catch(() => undefined);
        throw err;
    }
    return { id, url: golfPhotoPath(id) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A photo's bytes and recorded type; null when the id is unknown or the object has gone. */
export async function readPhoto(id: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!UUID.test(id)) return null;
    const sql = getSqlAdmin();
    const [row] = await sql<{ key: string; contentType: string }[]>`
        SELECT storage_key AS key, content_type AS "contentType" FROM golf_course_photos WHERE id = ${id}`;
    if (!row) return null;
    const bytes = await getObject(row.key);
    return bytes ? { bytes, contentType: row.contentType } : null;
}

/**
 * Removes objects after the rows that named them are gone. Best effort: an object left behind is
 * unreachable (nothing refers to its id) and only costs storage, so a failure is logged, never
 * raised into the edit that caused it.
 */
export async function dropObjects(keys: string[]): Promise<void> {
    if (keys.length === 0 || !attachmentsConfigured()) return;
    await Promise.all(keys.map(async key => {
        try {
            await deleteObject(key);
        } catch (err) {
            console.warn('[golf/photos] could not remove', key, err);
        }
    }));
}
