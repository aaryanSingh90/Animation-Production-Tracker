import { z } from 'zod'

/**
 * Shared password policy (Phase 1 auth hardening).
 *
 * Min 10 chars, must contain a letter AND a digit, and reject a few obvious
 * patterns. bcrypt handles the rest. Defined here — not inline in a route — so
 * the change-password flow (routes/auth.ts) and employee creation/reset
 * (routes/employees.ts) enforce the EXACT same rules and never drift apart.
 *
 * BUG-17: employees.ts previously used a weaker `min(6)` rule, so an account
 * could be created with a password the user could never change it to.
 */
export const STRONG_PASSWORD = z.string()
  .min(10, 'Password must be at least 10 characters.')
  .max(200)
  .refine(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s),
    'Password must contain at least one letter and one digit.')
  .refine(s => !/^(password|studio|admin|qwerty|12345)/i.test(s),
    'That password is too common. Pick something unique.')
