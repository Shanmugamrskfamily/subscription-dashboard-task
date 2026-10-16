import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo, LogoMark } from '../../components/brand/logo';
import { ThemeToggle } from '../../components/layout/controls';
import { Illustration } from '../../components/ui/feedback';

const FLOATERS = [
  { name: 'rocket', size: 190, className: 'left-[38%] top-[2%]', delay: '0s' },
  { name: 'paymentSuccess', size: 150, className: 'left-[6%] top-[30%]', delay: '-2s' },
  { name: 'coinsGrowth', size: 150, className: 'right-[6%] top-[38%]', delay: '-4s' },
  { name: 'renewalCalendar', size: 130, className: 'left-[36%] top-[58%]', delay: '-1s' },
] as const;

/** Split screen: brand story with floating 3D art on the left, the form on the right. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <title>{`${title} · PlanPilot`}</title>
      <aside className="relative overflow-hidden bg-brand-gradient text-white">
        <span
          className="absolute -top-36 -right-28 size-[26rem] rounded-full bg-white/[0.08]"
          aria-hidden
        />
        <span
          className="absolute -bottom-20 -left-20 size-64 rounded-full bg-white/[0.08]"
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-between gap-6 p-6 sm:p-10">
          <Link
            to="/plans"
            className="flex items-center gap-2.5 text-xl font-black"
            aria-label="PlanPilot home"
          >
            <LogoMark size={36} className="rounded-xl ring-1 ring-white/25" />
            PlanPilot
          </Link>
          <div className="relative hidden h-[380px] lg:block" aria-hidden>
            {FLOATERS.map((f) => (
              <div
                key={f.name}
                className={`absolute ${f.className} motion-safe:animate-float`}
                style={{ animationDelay: f.delay }}
              >
                <Illustration
                  name={f.name}
                  size={f.size}
                  eager
                  className="drop-shadow-[0_22px_32px_rgb(20_10_60_/_0.35)]"
                />
              </div>
            ))}
          </div>
          <div className="flex items-end justify-between gap-4 lg:block">
            <div>
              <p className="text-2xl leading-tight font-black tracking-tight text-balance sm:text-[32px]">
                Subscriptions on autopilot.
              </p>
              <p className="mt-2 hidden max-w-md text-white/85 sm:block">
                Plans, renewals, usage limits and revenue analytics in one secure dashboard.
              </p>
            </div>
            <div className="-mb-2 flex shrink-0 lg:hidden" aria-hidden>
              <Illustration name="rocket" size={92} eager className="motion-safe:animate-float" />
            </div>
          </div>
        </div>
      </aside>

      <main id="main" className="relative flex flex-col px-4 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <Link to="/plans" className="lg:hidden" aria-label="PlanPilot home">
            <Logo size={30} className="text-[17px]" />
          </Link>
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8"
        >
          <h1 className="text-[28px] font-black tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        </motion.div>
      </main>
    </div>
  );
}
