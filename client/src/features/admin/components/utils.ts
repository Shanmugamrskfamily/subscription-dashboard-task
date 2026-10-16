import { DAY_MS } from '@planpilot/shared';
import type { PlanLimits, UsageDto } from '@planpilot/shared';
import { getIn, setIn } from 'formik';
import type { FormikErrors } from 'formik';
import { ValidationError } from 'yup';
import type { AnySchema } from 'yup';
import { formatInr, formatInrCompact, plural } from '../../../lib/format';

// ---------- dates ----------

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar days from today to `value` (0 = today, 1 = tomorrow, negative = past). */
export function calendarDaysUntil(value: string | Date) {
  return Math.round((startOfDay(new Date(value)) - startOfDay(new Date())) / DAY_MS);
}

export function endsLabel(value: string) {
  const days = calendarDaysUntil(value);
  if (days < -1) return `ended ${Math.abs(days)} days ago`;
  if (days === -1) return 'ended yesterday';
  if (days === 0) return 'ends today';
  if (days === 1) return 'ends tomorrow';
  return `ends in ${days} days`;
}

/** `YYYY-MM-DD` in local time, the value format of `<input type="date">`. */
export function toDateInput(value: string | Date) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const tomorrowInput = () => toDateInput(new Date(Date.now() + DAY_MS));

/** A picked calendar date means "until the end of that day" in the admin's time zone. */
export const endOfDayIso = (dateInput: string) =>
  new Date(`${dateInput}T23:59:59.999`).toISOString();

/** Where an extension would land; the server counts from today for ended plans. */
export function previewEndDate(currentEnd: string, active: boolean, days: number) {
  const base = active ? Math.max(new Date(currentEnd).getTime(), Date.now()) : Date.now();
  return new Date(base + days * DAY_MS);
}

/** How far through its period a plan is, in whole days, for "Day 12 of 30". */
export function periodProgress(start: string, end: string) {
  const from = new Date(start).getTime();
  const total = Math.max(1, Math.round((new Date(end).getTime() - from) / DAY_MS));
  const elapsed = Math.min(total, Math.max(1, Math.ceil((Date.now() - from) / DAY_MS)));
  return { elapsed, total };
}

export const isFutureDateInput = (dateInput: string) =>
  new Date(`${dateInput}T23:59:59.999`).getTime() > Date.now();

const longDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const fullDateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short' });
const weekdayDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

export const todayLabel = () => longDate.format(new Date());
export const formatFullDateTime = (value: string) => fullDateTime.format(new Date(value));

/** "Today", "Yesterday", or "Wednesday, 14 Oct" for activity day headings. */
export function dayHeading(value: string) {
  const days = calendarDaysUntil(value);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  return weekdayDate.format(new Date(value));
}

// ---------- money and plans ----------

/** Whole rupees for KPI figures: "₹2,41,900" rather than "₹2,41,899.5". */
export const formatRupees = (paise: number) => formatInr(Math.round(paise / 100) * 100);

/** Full figure until it gets long enough to break a small tile, then "₹1.2Cr". */
export const formatKpiInr = (paise: number) =>
  paise >= 1_00_00_000 * 100 ? formatInrCompact(paise) : formatRupees(paise);

export function durationLabel(days: number) {
  if (days === 30) return 'month';
  if (days === 365) return 'year';
  if (days === 7) return 'week';
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}

export function limitsLabel(limits: PlanLimits) {
  const projects =
    limits.projects === null ? 'Unlimited projects' : plural(limits.projects, 'project');
  const members =
    limits.teamMembers === null ? 'unlimited members' : plural(limits.teamMembers, 'member');
  return `${projects} · ${members}`;
}

export const usageLabel = (usage: UsageDto) =>
  `${plural(usage.projects, 'project')} · ${plural(usage.teamMembers, 'member')}`;

// ---------- people and devices ----------

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function describeAgent(userAgent: string) {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const label =
    browser && os ? `${browser} on ${os}` : (browser ?? os ?? (ua ? ua : 'Unknown device'));
  return { label, mobile: /Mobile|Android|iPhone|iPad/.test(ua) };
}

// ---------- forms ----------

/**
 * Runs a shared Yup schema against the API payload a form will send, and returns
 * Formik errors. Used where the form's fields differ from the payload (rupees vs
 * paise, a date input vs an ISO date), so the client checks exactly what the server will.
 */
export function yupErrors<V>(schema: AnySchema, payload: unknown): FormikErrors<V> {
  try {
    schema.validateSync(payload, { abortEarly: false });
    return {};
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    let errors: FormikErrors<V> = {};
    for (const issue of error.inner.length ? error.inner : [error]) {
      if (issue.path && getIn(errors, issue.path) === undefined) {
        errors = setIn(errors, issue.path, issue.message);
      }
    }
    return errors;
  }
}

// ---------- files ----------

/** Saves text as a file. The BOM makes Excel read the rupee sign and names correctly. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
