import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * The one place this app talks to S3.
 *
 * ── On credentials ───────────────────────────────────────────────────────────────────
 *
 * There are none here, deliberately. The client is constructed with a region and nothing
 * else, which leaves the SDK's default provider chain to find them: an instance role on
 * the EC2 box, `~/.aws/credentials` or AWS_PROFILE on a developer's laptop. Both work
 * through the same code path, so there is no `NODE_ENV` branch deciding how to
 * authenticate — the environment answers that by what it makes available.
 *
 * Passing an access key here, or reading one from the environment into a `credentials`
 * block, would defeat that: the SDK stops consulting the chain the moment it is handed
 * something. It would also put a long-lived secret into the deploy's env file, GitHub
 * Secrets and every process listing on the box, to do a job that temporary, auto-rotating
 * instance credentials already do.
 *
 * The instance role needs s3:PutObject, s3:GetObject and s3:DeleteObject on
 * `<bucket>/support/*`, and nothing else.
 */

let _client: S3Client | null = null;

function region(): string {
    const value = process.env.AWS_REGION;
    if (!value) {
        throw new Error('AWS_REGION is not set. Required to store support attachments.');
    }
    return value;
}

/** Lazy singleton. Building one per request would re-resolve credentials every time. */
export function getS3Client(): S3Client {
    if (!_client) _client = new S3Client({ region: region() });
    return _client;
}

/**
 * The bucket support attachments live in.
 *
 * Read at call time rather than at module load: a missing bucket should fail the one
 * request that needed it, with a message naming the variable, not stop the whole app from
 * starting because a feature nobody has used yet is unconfigured.
 */
export function attachmentsBucket(): string {
    const bucket = process.env.SUPPORT_ATTACHMENTS_BUCKET;
    if (!bucket) {
        throw new Error(
            'SUPPORT_ATTACHMENTS_BUCKET is not set. Support attachments cannot be stored.',
        );
    }
    return bucket;
}

/** True when the feature is configured. The UI hides the paperclip when it is not. */
export function attachmentsConfigured(): boolean {
    return Boolean(process.env.SUPPORT_ATTACHMENTS_BUCKET && process.env.AWS_REGION);
}

export interface PutObjectInput {
    key: string;
    body: Buffer;
    contentType: string;
}

export async function putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: attachmentsBucket(),
            Key: key,
            Body: body,
            ContentType: contentType,
            // Belt and braces alongside the bucket's own default encryption: a bucket whose
            // default is later relaxed does not silently start storing passport scans in
            // the clear.
            ServerSideEncryption: 'AES256',
        }),
    );
}

/**
 * How long a download link lives. Long enough to click and for a large file to finish
 * transferring, short enough that a URL copied out of a browser's history or a screen
 * share is not a lasting way in.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

export interface PresignGetInput {
    key: string;
    /** What the browser should call the saved file. */
    fileName: string;
    contentType: string;
}

/**
 * A short-lived URL for one object.
 *
 * `attachment`, not `inline`: the browser saves the file instead of rendering it. An HTML
 * or SVG file rendered inline from a bucket would execute in that origin, and the upload
 * allowlist is not the place to be the only thing standing between a customer and that.
 * The filename is quoted and stripped of quotes and control characters, because it is a
 * customer-supplied string going into a response header.
 */
export async function presignDownloadUrl({ key, fileName, contentType }: PresignGetInput): Promise<string> {
    const safeName = fileName.replace(/["\\r\n]/g, '_');

    return getSignedUrl(
        getS3Client(),
        new GetObjectCommand({
            Bucket: attachmentsBucket(),
            Key: key,
            ResponseContentType: contentType,
            ResponseContentDisposition: `attachment; filename="${safeName}"`,
        }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
}

/** Remove one object. Used when an upload's database row could not be written. */
export async function deleteObject(key: string): Promise<void> {
    await getS3Client().send(
        new DeleteObjectCommand({ Bucket: attachmentsBucket(), Key: key }),
    );
}
