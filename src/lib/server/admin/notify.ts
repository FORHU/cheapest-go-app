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
