import { CloudOff, Coffee } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';
import { LogoMark } from '../brand/logo';

/** Full-screen branded loader while the session is restored on page load. */
export function BrandLoader({ label = 'Loading PlanPilot…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={64} animated className="drop-shadow-[0_12px_28px_rgb(79_70_229_/_0.4)]" />
        <p className="text-sm font-extrabold text-muted">{label}</p>
      </div>
    </div>
  );
}

/** Thin bar at the top while a lazy page or data is loading. */
export function TopProgress({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-brand/15"
          role="progressbar"
          aria-label="Loading page"
        >
          <div className="h-full w-2/5 bg-brand-gradient motion-safe:animate-[progress_1.1s_ease-in-out_infinite]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RouteProgress() {
  const navigation = useNavigation();
  return <TopProgress active={navigation.state === 'loading'} />;
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40 }}
          animate={{ y: 0 }}
          exit={{ y: -40 }}
          role="status"
          className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          <CloudOff className="size-4" aria-hidden /> You're offline. Changes will work again once
          you reconnect.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Render's free tier sleeps after 15 idle minutes and takes up to a minute to wake.
 * If the API is slow to answer, say so instead of leaving a blank wait.
 */
export function ServerWakeBanner() {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => !cancelled && setWaking(true), 2500);
    const ping = async (attempt = 0): Promise<void> => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          clearTimeout(slow);
          if (!cancelled) setWaking(false);
          return;
        }
      } catch {
        // Not up yet.
      }
      if (!cancelled && attempt < 20) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 5000)));
        return ping(attempt + 1);
      }
    };
    void ping();
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, []);
  return (
    <AnimatePresence>
      {waking && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          role="status"
          className="fixed inset-x-3 bottom-20 z-[65] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-pop sm:bottom-6"
        >
          <Coffee className="size-5 shrink-0 text-brand" aria-hidden />
          <span>
            <b>Waking up the server…</b> The free hosting plan naps when idle. This takes up to a
            minute.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
