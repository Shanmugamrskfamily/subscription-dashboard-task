import { DAY_MS } from '@planpilot/shared';
import { describe, expect, it } from 'vitest';
import { changeTypeFor, computeQuote, unusedCredit } from '../src/modules/subscriptions/proration';

const NOW = new Date('2026-10-16T12:00:00Z');
const starter = { id: 's', price: 29_900, durationDays: 30, tier: 1 };
const pro = { id: 'p', price: 79_900, durationDays: 30, tier: 2 };
const proAnnual = { id: 'pa', price: 7_99_900, durationDays: 365, tier: 2 };

const current = (plan: typeof starter, daysUsed: number, creditBasis = plan.price) => ({
  planId: plan.id,
  tier: plan.tier,
  durationDays: plan.durationDays,
  startDate: new Date(NOW.getTime() - daysUsed * DAY_MS),
  endDate: new Date(NOW.getTime() + (plan.durationDays - daysUsed) * DAY_MS),
  creditBasis,
});

describe('changeTypeFor', () => {
  it('names every kind of change', () => {
    expect(changeTypeFor(pro, null, false)).toBe('new');
    expect(changeTypeFor(pro, null, true)).toBe('renewal');
    expect(changeTypeFor(pro, current(starter, 5), false)).toBe('upgrade');
    expect(changeTypeFor(starter, current(pro, 5), false)).toBe('downgrade');
    // Same tier, longer commitment.
    expect(changeTypeFor(proAnnual, current(pro, 5), false)).toBe('upgrade');
    expect(changeTypeFor(pro, current(proAnnual, 5), false)).toBe('downgrade');
    // The same plan while it is still active: an early renewal.
    expect(changeTypeFor(pro, current(pro, 28), false)).toBe('renewal');
  });
});

describe('unusedCredit', () => {
  it('is the unused share of the period value, rounded down', () => {
    expect(unusedCredit(current(starter, 28), NOW)).toBe(Math.floor((29_900 * 2) / 30));
    expect(unusedCredit(current(pro, 0), NOW)).toBe(79_900);
  });

  it('is zero without a plan, for a finished period, or for an admin-assigned plan', () => {
    expect(unusedCredit(null, NOW)).toBe(0);
    expect(unusedCredit(current(pro, 31), NOW)).toBe(0);
    expect(unusedCredit(current(pro, 10, 0), NOW)).toBe(0);
  });
});

describe('computeQuote', () => {
  it('renews early at full price, adding the period after the current end date', () => {
    // 2 of 30 Pro days left: pay ₹799, the plan now ends 2 + 30 days from today.
    const now = current(pro, 28);
    const q = computeQuote(pro, now, false, NOW);
    expect(q).toMatchObject({ changeType: 'renewal', credit: 0, amountDue: 79_900, bonusDays: 0 });
    expect(q.endDate.getTime()).toBe(now.endDate.getTime() + 30 * DAY_MS);
    // The unused 2 days stay in the value basis for any later plan change.
    expect(q.creditBasis).toBe(79_900 + Math.floor((79_900 * 2) / 30));
  });

  it('charges full price for a first plan', () => {
    const q = computeQuote(pro, null, false, NOW);
    expect(q).toMatchObject({
      changeType: 'new',
      credit: 0,
      amountDue: 79_900,
      bonusDays: 0,
      creditBasis: 79_900,
    });
    expect(q.endDate.getTime() - NOW.getTime()).toBe(30 * DAY_MS);
  });

  it('upgrades mid-cycle for the price difference', () => {
    // 2 of 30 Starter days left → ₹19.93 credit → ₹779.07 due.
    const q = computeQuote(pro, current(starter, 28), false, NOW);
    expect(q.credit).toBe(1993);
    expect(q.amountDue).toBe(79_900 - 1993);
    expect(q.creditBasis).toBe(79_900);
  });

  it('turns leftover credit into bonus days on a downgrade', () => {
    // 20 unused Pro days are worth ₹532.66 → Starter is free and the rest becomes days.
    const q = computeQuote(starter, current(pro, 10), false, NOW);
    expect(q.changeType).toBe('downgrade');
    expect(q.amountDue).toBe(0);
    const leftover = q.credit - starter.price;
    expect(q.bonusDays).toBe(Math.floor(leftover / (starter.price / 30)));
    expect(q.endDate.getTime() - NOW.getTime()).toBe((30 + q.bonusDays) * DAY_MS);
    // The whole credit carries forward as value of the new period.
    expect(q.creditBasis).toBe(q.credit);
  });

  it('treats less than ₹1 due as nothing due', () => {
    const almostFull = { ...current(pro, 0), creditBasis: 79_850 };
    // A same-priced plan on the same tier: ₹0.50 due rounds to nothing (Razorpay can't
    // charge under ₹1).
    const proTwin = { ...pro, id: 'p2' };
    expect(computeQuote(proTwin, almostFull, false, NOW).amountDue).toBe(0);
  });

  it('caps bonus days at a year', () => {
    const huge = { ...current(proAnnual, 1) };
    const q = computeQuote(starter, huge, false, NOW);
    expect(q.bonusDays).toBe(365);
  });
});
