import { PROJECT_COLORS } from '@planpilot/shared';

export type ProjectColor = (typeof PROJECT_COLORS)[number];

/**
 * Accent colours a user picks per project. Mid-tone hues read well on light and dark
 * surfaces, and full class names keep them visible to Tailwind's scanner.
 */
export const PROJECT_COLOR: Record<ProjectColor, { label: string; solid: string; tile: string }> = {
  indigo: { label: 'Indigo', solid: 'bg-indigo-500', tile: 'from-indigo-400 to-indigo-600' },
  violet: { label: 'Violet', solid: 'bg-violet-500', tile: 'from-violet-400 to-violet-600' },
  sky: { label: 'Sky', solid: 'bg-sky-500', tile: 'from-sky-400 to-sky-600' },
  emerald: { label: 'Emerald', solid: 'bg-emerald-500', tile: 'from-emerald-400 to-emerald-600' },
  amber: { label: 'Amber', solid: 'bg-amber-500', tile: 'from-amber-400 to-amber-600' },
  rose: { label: 'Rose', solid: 'bg-rose-500', tile: 'from-rose-400 to-rose-600' },
};

export const isProjectColor = (value: string): value is ProjectColor =>
  (PROJECT_COLORS as readonly string[]).includes(value);

/** Older or hand-edited records may hold a colour we no longer offer. */
export const colorOf = (value: string) => PROJECT_COLOR[isProjectColor(value) ? value : 'indigo'];
