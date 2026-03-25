import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

const MAX_RETRIES_PER_RUN = 20;
const MAX_AGE_HOURS = 48; // Don't retry emails older than 48h

/**
 * POST /api/internal/retry-emails
 *
 * Cron endpoint that retries failed/queued emails.
 * Reads the stored HTML body from email_logs.metadata.htmlBody and
 * re-sends via Resend API. Updates the log entry status on success.
 *
 * Auth: Bearer token must match CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY.
 * Set up a cron job in Coolify to call this every 15 minutes:
 *   curl -X POST https://your-domain/api/internal/retry-emails \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request) {
    try {
        // ── Auth check ──────────────────────────────────────────────
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resendApiKey = env.RESEND_API_KEY;
        if (!resendApiKey) {
            return NextResponse.json({
                error: 'RESEND_API_KEY not configured — nothing to retry',
            }, { status: 503 });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // ── Fetch retryable email logs ──────────────────────────────
        const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

        const { data: logs, error: fetchErr } = await supabase
            .from('email_logs')
            .select('id, booking_id, recipient, subject, email_type, metadata, created_at')
            .in('status', ['failed', 'queued'])
            .gte('created_at', cutoff)
            .order('created_at', { ascending: true })
            .limit(MAX_RETRIES_PER_RUN);

        if (fetchErr) {
            console.error('[retry-emails] Fetch error:', fetchErr);
            return NextResponse.json({ error: 'Failed to query email_logs' }, { status: 500 });
        }

        if (!logs || logs.length === 0) {
            return NextResponse.json({ success: true, retried: 0, message: 'No emails to retry' });
        }

        console.log(`[retry-emails] Found ${logs.length} emails to retry`);

        let succeeded = 0;
        let failed = 0;
        let skipped = 0;

        for (const log of logs) {
            const htmlBody = (log.metadata as any)?.htmlBody;

            if (!htmlBody) {
                // No stored HTML — can't retry without regenerating
                skipped++;
                continue;
            }

            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                        to: [log.recipient],
                        subject: log.subject,
                        html: htmlBody,
                    }),
                });

                if (resendResponse.ok) {
                    // Update log to sent, clear htmlBody from metadata to save space
                    const cleanMetadata = { ...(log.metadata as any) };
                    delete cleanMetadata.htmlBody;

                    await supabase
                        .from('email_logs')
                        .update({
                            status: 'sent',
                            sent_at: new Date().toISOString(),
                            error_message: null,
                            metadata: { ...cleanMetadata, retriedAt: new Date().toISOString() },
                        })
                        .eq('id', log.id);

                    succeeded++;
                    console.log(`[retry-emails] Sent: ${log.id}`);
                } else {
                    const errorText = await resendResponse.text();
                    // Update error message but keep status as failed
                    await supabase
                        .from('email_logs')
                        .update({
                            error_message: `Retry failed (${resendResponse.status}): ${errorText}`,
                        })
                        .eq('id', log.id);

                    failed++;
                    console.error(`[retry-emails] Failed: ${log.id} — ${resendResponse.status}`);
                }
            } catch (err) {
                failed++;
                console.error(`[retry-emails] Error retrying ${log.id}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            retried: succeeded,
            failed,
            skipped,
            total: logs.length,
        });
    } catch (err: any) {
        console.error('[retry-emails] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
