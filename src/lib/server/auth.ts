'use server';

/**
 * Server Actions for authentication operations.
 * All auth checks and sensitive operations happen server-side.
 */

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// ============================================================================
// Types
// ============================================================================

export interface AuthResult {
  success: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

// ============================================================================
// Helper: Get current user (server-side)
// ============================================================================

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || '',
    firstName: meta.first_name || meta.firstName || meta.name?.split(' ')[0] || 'User',
    lastName: meta.last_name || meta.lastName || meta.name?.split(' ').slice(1).join(' ') || '',
    avatar: meta.avatar_url || meta.picture,
  };
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Update user profile (name, etc.)
 */
export async function updateProfile(data: {
  firstName: string;
  lastName: string;
}): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: data.firstName,
        last_name: data.lastName,
        full_name: `${data.firstName} ${data.lastName}`,
      },
    });

    if (error) return { success: false, error: error.message };

    revalidatePath('/account');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}

/**
 * Update user password (requires current password verification)
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return { success: false, error: 'No user logged in' };
    }

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Update to new password
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update password',
    };
  }
}

/**
 * Sign out the current user (server-side)
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * Reset password via email
 */
export async function resetPasswordForEmail(email: string): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/auth/reset-password`,
    });

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reset email',
    };
  }
}
