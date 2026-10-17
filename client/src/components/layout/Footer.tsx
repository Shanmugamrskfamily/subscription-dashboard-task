import { BookOpenText, Globe, Mail, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';

const DEVELOPER = {
  name: 'Shanmugam R',
  role: 'Full Stack Developer · React · Node.js · MongoDB',
  email: 'shanmugamrskfamily@gmail.com',
  portfolio: 'https://shanmugam-portfolio.vercel.app',
  github: 'https://github.com/Shanmugamrskfamily',
  linkedin: 'https://www.linkedin.com/in/shanmugamrskfamily',
};

const REPOSITORY = 'https://github.com/Shanmugamrskfamily/subscription-dashboard-task';
// Swagger UI lives on the API host; in development Vite proxies /api to it.
const API_DOCS = import.meta.env.VITE_API_DOCS_URL || '/api/docs/';

// Brand glyphs (Simple Icons, CC0): Lucide no longer ships brand logos.
const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

const Glyph = ({ path, size = 18 }: { path: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d={path} />
  </svg>
);

const iconLink =
  'grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-muted transition hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand-ink active:scale-95';

/** "Designed and developed by" card with the SR mark, which follows the theme. */
export function DeveloperCredit({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-center shadow-card sm:flex-row sm:text-left',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-1 sm:flex-row">
        <span className="relative size-14 shrink-0">
          <img
            src="/brand/sr-mark-light.png"
            alt="Shanmugam R logo"
            width={56}
            height={56}
            className="size-14 rounded-2xl shadow-card dark:hidden"
          />
          <img
            src="/brand/sr-mark-dark.png"
            alt="Shanmugam R logo"
            width={56}
            height={56}
            className="hidden size-14 rounded-2xl shadow-card dark:block"
          />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.12em] text-subtle uppercase">
            Designed &amp; developed by
          </p>
          <p className="text-[17px] leading-tight font-black tracking-tight">{DEVELOPER.name}</p>
          <p className="text-[13px] text-balance text-muted">{DEVELOPER.role}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
        <a
          className={iconLink}
          href={DEVELOPER.portfolio}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Shanmugam R's portfolio (opens in a new tab)"
        >
          <Globe className="size-[19px]" aria-hidden />
        </a>
        <a
          className={iconLink}
          href={DEVELOPER.github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Shanmugam R on GitHub (opens in a new tab)"
        >
          <Glyph path={GITHUB_PATH} />
        </a>
        <a
          className={iconLink}
          href={DEVELOPER.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Shanmugam R on LinkedIn (opens in a new tab)"
        >
          <Glyph path={LINKEDIN_PATH} size={17} />
        </a>
        <a className={iconLink} href={`mailto:${DEVELOPER.email}`} aria-label="Email Shanmugam R">
          <Mail className="size-[19px]" aria-hidden />
        </a>
      </div>
    </div>
  );
}

const footerLink =
  'inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-muted transition hover:border-brand/40 hover:text-ink';

/** Site footer: what PlanPilot is, useful links for reviewers, and the developer credit. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('w-full', className)}>
      <div className="grid gap-6 rounded-3xl border border-line bg-surface-2/60 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <Link to="/plans" aria-label="PlanPilot pricing" className="inline-block">
            <Logo size={32} className="text-[18px]" />
          </Link>
          <p className="mt-3 max-w-[48ch] text-[13.5px] text-muted">
            Subscriptions on autopilot: plans, renewals, usage limits and revenue analytics in one
            secure dashboard.
          </p>
          <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-2">
            <Link to="/plans" className={footerLink}>
              <ReceiptText className="size-[15px]" aria-hidden /> Pricing
            </Link>
            <a href={API_DOCS} target="_blank" rel="noopener noreferrer" className={footerLink}>
              <BookOpenText className="size-[15px]" aria-hidden /> API documentation
            </a>
            <a href={REPOSITORY} target="_blank" rel="noopener noreferrer" className={footerLink}>
              <Glyph path={GITHUB_PATH} size={15} /> Source code
            </a>
          </nav>
        </div>
        <DeveloperCredit />
        <div className="flex flex-col gap-1.5 border-t border-line pt-4 text-center text-[12.5px] text-balance text-subtle md:flex-row md:justify-between md:text-left lg:col-span-2">
          <span>© {new Date().getFullYear()} PlanPilot · Full Stack Web Developer assessment</span>
          <span>React · Redux Toolkit · Express · MongoDB · Tailwind CSS</span>
        </div>
      </div>
    </footer>
  );
}
