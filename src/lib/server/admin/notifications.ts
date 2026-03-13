import { createAdminClient } from '@/utils/supabase/admin';
import { Notification } from '@/types/admin';

export async function getNotifications(): Promise<Notification[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }

    return (data || []).map(n => ({
        id: n.id,
        title: n.title,
        description: n.description,
        type: n.type as 'booking' | 'system' | 'alert',
        read: n.read,
        created_at: n.created_at
    }));
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

    if (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
    return true;
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);

    if (error) {
        console.error('Error marking all notifications as read:', error);
        return false;
    }
    return true;
}