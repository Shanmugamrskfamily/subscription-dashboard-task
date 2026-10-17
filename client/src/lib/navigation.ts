/** Only same-site paths are allowed as a post-login destination (no open redirects). */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')
    ? next
    : null;
}
