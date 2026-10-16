const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat('en-IN');
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** 79900 paise → "₹799"; 77907 → "₹779.07". */
export const formatInr = (paise: number) => inr.format(paise / 100);
export const formatInrCompact = (paise: number) => inrCompact.format(paise / 100);
export const formatNumber = (value: number) => number.format(value);
export const formatDate = (value: string | Date) => date.format(new Date(value));
export const formatDateShort = (value: string | Date) => dateShort.format(new Date(value));
export const formatDateTime = (value: string | Date) => dateTime.format(new Date(value));

export function formatRelative(value: string | Date, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 30) return relative.format(Math.round(seconds / 86_400), 'day');
  return formatDate(value);
}

/** Change against the previous period, as a signed percentage. */
export function percentChange(value: number, previous: number): number | null {
  if (!previous) return value ? null : 0;
  return Math.round(((value - previous) / previous) * 1000) / 10;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`;
