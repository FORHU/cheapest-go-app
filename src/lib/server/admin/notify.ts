import { createAdminClient } from '@/utils/supabase/admin';

type NotificationType = 'booking' | 'system' | 'alert';

/**
 * Fire-and-forget notification insert.
 * Never throws — notifications must not break the main flow.
 */
export function createNotification(
    title: string,
    description: string,
    type: NotificationType = 'booking'
): void {
    try {
        const supabase = createAdminClient();
        Promise.resolve(
            supabase.from('notifications').insert({
                title,
                description,
                type,
                read: false,
            })
        ).then(({ error }) => {
            if (error) console.error('[notify] Insert failed:', error.message);
        }).catch(() => {
            // Silently ignore — notification is non-critical
        });
    } catch {
        // Never throw
    }
}

/**
 * Structured admin audit log.
 * Emits a JSON line for centralized log aggregation (Coolify logs, etc.).
 * Never throws — audit logging must not break the main flow.
 */
export function logAdminAction(params: {
    action: string;
    bookingId?: string;
    sessionId?: string;
    table?: string;
    previousStatus?: string;
    newStatus?: string;
    provider?: string;
    details?: string;
    triggeredBy?: string;
}): void {
    try {
        console.log(JSON.stringify({
            _event: 'admin_audit',
            ...params,
            timestamp: new Date().toISOString(),
        }));
    } catch {
        // Never throw
    }
}
