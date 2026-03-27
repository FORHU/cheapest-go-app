/**
 * Admin Audit Logger
 *
 * Writes structured audit events for every privileged admin action.
 * Always emits a structured JSON line to stdout (captured by Vercel / any
 * log aggregator). Also attempts a best-effort insert into the
 * `admin_audit_log` table — silently skips if the table doesn't exist yet.
 */

export interface AuditEvent {
    action: string;
    adminId: string;
    adminEmail: string;
    targetId?: string;
    details?: Record<string, unknown>;
}

/**
 * Log a privileged admin action.
 * Safe to call fire-and-forget — never throws.
 */
export async function logAdminAction(event: AuditEvent): Promise<void> {
    const payload = {
        _event: 'admin_action',
        ...event,
        timestamp: new Date().toISOString(),
    };

    // 1. Structured stdout log — always reliable
    console.log(JSON.stringify(payload));

    // 2. Best-effort DB write
    try {
        const { createAdminClient } = await import('@/utils/supabase/admin');
        const supabase = createAdminClient();
        const { error } = await supabase.from('admin_audit_log').insert({
            action: event.action,
            admin_id: event.adminId,
            admin_email: event.adminEmail,
            target_id: event.targetId ?? null,
            details: event.details ?? {},
            created_at: payload.timestamp,
        });
        if (error) {
            // Table may not exist yet — suppress the error; the console log is the fallback
            if (!error.message?.includes('does not exist')) {
                console.warn('[AuditLog] DB insert failed:', error.message);
            }
        }
    } catch {
        // Swallow — the console log above is the durable record
    }
}
