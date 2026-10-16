import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { Illustration } from '../../components/ui/feedback';
import { formatDate, plural } from '../../lib/format';
import { useMySubscriptionQuery } from './subscriptionApi';

const seenKey = (key: string) => `planpilot-reminder:${key}`;
const wasSeen = (key: string) => {
  try {
    return sessionStorage.getItem(seenKey(key)) === '1';
  } catch {
    return false;
  }
};
const markSeen = (key: string) => {
  try {
    sessionStorage.setItem(seenKey(key), '1');
  } catch {
    // Storage blocked: the reminder may show again, which is harmless.
  }
};

/**
 * The important pop-ups: a plan about to expire, or one that has ended. Each shows
 * once per browser session and state, never on the plans page itself.
 */
export function PlanReminders() {
  const { data } = useMySubscriptionQuery();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const sub = data?.subscription;
  const last = data?.lastSubscription;
  const expiring = data?.status === 'active' && sub && sub.daysLeft <= 3;
  const ended = (data?.status === 'expired' || data?.status === 'cancelled') && last;
  const key = expiring ? `expiring:${sub.id}:${sub.endDate}` : ended ? `ended:${last.id}` : null;

  useEffect(() => {
    if (key && pathname !== '/plans' && !wasSeen(key)) {
      const timer = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(timer);
    }
  }, [key, pathname]);

  if (!key) return null;
  const close = () => {
    markSeen(key);
    setOpen(false);
  };
  const goToPlans = () => {
    close();
    navigate('/plans');
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && close()}
      title={
        expiring
          ? `Your ${sub.plan.name} plan expires in ${plural(Math.max(1, sub.daysLeft), 'day')}`
          : `Your ${last?.plan.name} plan has ${data?.status === 'cancelled' ? 'been cancelled' : 'expired'}`
      }
      description={
        expiring
          ? `It ends on ${formatDate(sub.endDate)}. Renew now to keep your projects editable and your team seats.`
          : 'Your projects are read-only until you pick a plan. Everything you created is still here.'
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Remind me later
          </Button>
          <Button onClick={goToPlans}>{expiring ? 'Renew or change plan' : 'Choose a plan'}</Button>
        </>
      }
    >
      <div className="flex justify-center py-2">
        <Illustration
          name={expiring ? 'renewalCalendar' : 'accessExpired'}
          size={150}
          eager
          float
        />
      </div>
    </Modal>
  );
}
