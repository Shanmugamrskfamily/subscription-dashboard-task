import { DAY_MS, MIN_CHARGE_PAISE } from '@planpilot/shared';
import type { ChangeType } from '@planpilot/shared';

export interface QuotePlan {
  id: string;
  price: number;
  durationDays: number;
  tier: number;
}

export interface QuoteCurrent {
  planId: string;
  tier: number;
  durationDays: number;
  startDate: Date;
  endDate: Date;
  creditBasis: number;
}

export interface ComputedQuote {
  changeType: ChangeType;
  credit: number;
  amountDue: number;
  bonusDays: number;
  startDate: Date;
  endDate: Date;
  /** Value of the new period, carried into the next plan change. */
  creditBasis: number;
}

const MAX_BONUS_DAYS = 365;

export function changeTypeFor(
  plan: QuotePlan,
  current: QuoteCurrent | null,
  hadPrevious: boolean,
): ChangeType {
  if (!current) return hadPrevious ? 'renewal' : 'new';
  if (plan.id === current.planId) return 'renewal';
  if (plan.tier !== current.tier) return plan.tier > current.tier ? 'upgrade' : 'downgrade';
  // Same tier, different billing cycle: committing for longer counts as an upgrade.
  return plan.durationDays >= current.durationDays ? 'upgrade' : 'downgrade';
}

/** Unused share of what the current period was worth, rounded down to whole paise. */
export function unusedCredit(current: QuoteCurrent | null, now: Date): number {
  if (!current) return 0;
  const total = current.endDate.getTime() - current.startDate.getTime();
  const remaining = current.endDate.getTime() - now.getTime();
  if (total <= 0 || remaining <= 0) return 0;
  return Math.floor((current.creditBasis * Math.min(remaining, total)) / total);
}

/**
 * One rule for every plan change:
 *   credit     = unused value of the current plan
 *   amount due = new price - credit (never below zero; under ₹1 counts as zero)
 *   leftover credit (downgrades) becomes bonus days on the new plan.
 * The new plan always starts now.
 */
export function computeQuote(
  plan: QuotePlan,
  current: QuoteCurrent | null,
  hadPrevious: boolean,
  now = new Date(),
): ComputedQuote {
  const changeType = changeTypeFor(plan, current, hadPrevious);
  const credit = unusedCredit(current, now);

  // Renewing the current plan early: pay the full price and the new period is added
  // after the current end date, so no paid day is lost. The unused value carries over
  // in the credit basis for any later plan change.
  if (current && plan.id === current.planId) {
    const from = Math.max(current.endDate.getTime(), now.getTime());
    return {
      changeType,
      credit: 0,
      amountDue: plan.price,
      bonusDays: 0,
      startDate: now,
      endDate: new Date(from + plan.durationDays * DAY_MS),
      creditBasis: plan.price + credit,
    };
  }

  let amountDue = Math.max(0, plan.price - credit);
  if (amountDue > 0 && amountDue < MIN_CHARGE_PAISE) amountDue = 0;

  const leftover = Math.max(0, credit - plan.price);
  const dailyRate = plan.price / plan.durationDays;
  const bonusDays = dailyRate > 0 ? Math.min(MAX_BONUS_DAYS, Math.floor(leftover / dailyRate)) : 0;

  return {
    changeType,
    credit,
    amountDue,
    bonusDays,
    startDate: now,
    endDate: new Date(now.getTime() + (plan.durationDays + bonusDays) * DAY_MS),
    creditBasis: amountDue + credit,
  };
}
