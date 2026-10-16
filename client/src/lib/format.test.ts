import { describe, expect, it } from 'vitest';
import { formatInr, formatRelative, initials, percentChange, plural } from './format';

describe('formatInr', () => {
  it('drops paise for whole rupees and uses Indian digit grouping', () => {
    expect(formatInr(79_900)).toBe('₹799');
    expect(formatInr(18_435_000)).toBe('₹1,84,350');
  });

  it('always shows two decimals when there are paise', () => {
    expect(formatInr(47_640)).toBe('₹476.40');
    expect(formatInr(77_907)).toBe('₹779.07');
  });
});

describe('percentChange', () => {
  it('rounds to one decimal place', () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(1, 3)).toBe(-66.7);
  });

  it('has no percentage when growing from zero', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');

  it('describes recent times in words', () => {
    expect(formatRelative('2026-10-16T11:59:40Z', now)).toBe('just now');
    expect(formatRelative('2026-10-16T11:55:00Z', now)).toBe('5 minutes ago');
    expect(formatRelative('2026-10-16T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelative('2026-10-19T12:00:00Z', now)).toBe('in 3 days');
  });

  it('falls back to a date after a month', () => {
    expect(formatRelative('2026-08-01T12:00:00Z', now)).toBe('1 Aug 2026');
  });
});

describe('text helpers', () => {
  it('builds initials from the first two words', () => {
    expect(initials('Priya  Sharma Iyer')).toBe('PS');
    expect(initials('arjun')).toBe('A');
  });

  it('pluralises counts', () => {
    expect(plural(1, 'project')).toBe('1 project');
    expect(plural(3, 'project')).toBe('3 projects');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});
