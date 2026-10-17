import { ERROR_CODES } from '@planpilot/shared';
import { Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Illustration } from '../../components/ui/feedback';
import type { AccountRestriction } from './authSlice';

const ART = {
  [ERROR_CODES.ACCOUNT_BLOCKED]: 'accountBlocked',
  [ERROR_CODES.ACCOUNT_INACTIVE]: 'accountInactive',
  [ERROR_CODES.ACCOUNT_ACCESS_EXPIRED]: 'accessExpired',
} as const;

/** The specific reason an admin-restricted account can't sign in, with a way to get help. */
export function RestrictionBanner({ restriction }: { restriction: AccountRestriction }) {
  const art = ART[restriction.code as keyof typeof ART] ?? 'accountBlocked';
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="flex items-start gap-3.5 rounded-2xl border border-danger/35 bg-danger-soft p-4 text-danger-ink"
    >
      <Illustration name={art} size={58} eager className="shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-extrabold">{restriction.message}</p>
        {restriction.reason && <p className="mt-0.5 opacity-90">Reason: {restriction.reason}</p>}
        {restriction.supportEmail && (
          <p className="mt-1.5">
            Contact{' '}
            <a
              className="font-extrabold underline underline-offset-2"
              href={`mailto:${restriction.supportEmail}`}
            >
              {restriction.supportEmail}
            </a>{' '}
            to restore access.
          </p>
        )}
      </div>
    </motion.div>
  );
}

/** Locked after too many failed attempts: a live countdown instead of a vague error. */
export function LockoutBanner({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left === 0) onDone();
  }, [left, onDone]);
  const minutes = Math.floor(left / 60);
  const secs = String(left % 60).padStart(2, '0');
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning-ink"
    >
      <Clock className="size-5 shrink-0" aria-hidden />
      <p>
        <b>Too many failed attempts.</b> For your security, sign-in is paused. Try again in{' '}
        <span className="num font-black">
          {minutes}:{secs}
        </span>
        .
      </p>
    </div>
  );
}
