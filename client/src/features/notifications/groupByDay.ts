import type { NotificationDto } from '@planpilot/shared';

const thisYear = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});
const otherYear = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Local calendar day, so "Today" means today where the reader is. */
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export interface DayGroup {
  key: string;
  label: string;
  items: NotificationDto[];
}

/** Splits a newest-first list into Today / Yesterday / dated sections, keeping the order. */
export function groupByDay(items: NotificationDto[], now = new Date()): DayGroup[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const labels = new Map([
    [dayKey(now), 'Today'],
    [dayKey(yesterday), 'Yesterday'],
  ]);

  const groups: DayGroup[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(item);
      continue;
    }
    const label =
      labels.get(key) ??
      (date.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(date);
    groups.push({ key, label, items: [item] });
  }
  return groups;
}
