import { z } from 'zod'

/**
 * Turn a ZodError into a single human-readable line for client display.
 * Replaces the default `.flatten()` which produces an object that JSON.stringify's
 * into "[object Object]" when displayed in a simple text UI.
 */
export function zodMsg(err: z.ZodError): string {
  return err.issues.map(i => {
    const field = i.path.length ? i.path.join('.') : 'body'
    return `${field}: ${i.message}`
  }).join(' · ')
}
