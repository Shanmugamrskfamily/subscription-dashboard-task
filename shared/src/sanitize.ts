/**
 * Plain-text sanitising for free-text fields (names, plan names, features, reasons).
 *
 * React already escapes everything it renders, so this is defence in depth: stored
 * data stays clean even if another consumer (an email, a CSV export) skips escaping.
 */

// Tags are removed, not escaped: these fields never legitimately contain markup.
const TAG = /<\/?[a-z!][^>]*>/gi;
// Control characters except tab, newline and carriage return.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_URL = /\b(?:javascript|vbscript|data)\s*:/gi;

export function sanitizeText(value: string): string {
  return value
    .replace(TAG, '')
    .replace(CONTROL, '')
    .replace(SCRIPT_URL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keys MongoDB treats as operators or paths. User input must never carry them. */
export function isUnsafeKey(key: string): boolean {
  return (
    key.startsWith('$') ||
    key.includes('.') ||
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype'
  );
}

/** Spreadsheet apps execute cells that start with these characters (CSV injection). */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
