'use server';

/**
 * Re-exports from lib/server/auth.ts
 * Server actions are centralized in lib/server/ for clean architecture.
 * This file exists for Next.js App Router compatibility.
 */

export {
  getCurrentUser,
  updateProfile,
  updatePassword,
  signOut,
  resetPasswordForEmail,
} from '@/lib/server/auth';

export type {
  AuthResult,
  UserProfile,
} from '@/lib/server/auth';
