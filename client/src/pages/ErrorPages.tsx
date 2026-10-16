import { ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router';
import { buttonVariants } from '../components/ui/button';
import { Illustration } from '../components/ui/feedback';
import { Logo } from '../components/brand/logo';
import type { IllustrationName } from '../lib/illustrations';

function ErrorLayout({
  code,
  illustration,
  title,
  description,
  actions,
  detail,
}: {
  code: string;
  illustration: IllustrationName;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-bg px-4">
      <title>{`${title} · PlanPilot`}</title>
      <meta name="robots" content="noindex" />
      <header className="mx-auto w-full max-w-5xl py-5">
        <Link to="/" aria-label="PlanPilot home">
          <Logo />
        </Link>
      </header>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center pb-16 text-center"
      >
        <Illustration name={illustration} size={190} eager float />
        <p className="mt-6 text-sm font-black tracking-[0.3em] text-brand-ink">{code}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-muted">{description}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div>
        {detail && <div className="mt-6 text-xs text-subtle">{detail}</div>}
      </motion.section>
    </main>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      code="404"
      illustration="lostCompass"
      title="This page went off course"
      description="The link may be old, or the page has moved. Let's get you back on track."
      actions={
        <>
          <button
            type="button"
            className={buttonVariants({ variant: 'outline' })}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft /> Go back
          </button>
          <Link to="/" className={buttonVariants()}>
            <Home /> Home
          </Link>
        </>
      }
    />
  );
}

export function ForbiddenPage() {
  return (
    <ErrorLayout
      code="403"
      illustration="lockedDoor"
      title="This area is for admins"
      description="Your account doesn't have access to this page. If you think it should, ask an administrator."
      actions={
        <Link to="/" className={buttonVariants()}>
          <Home /> Back to my dashboard
        </Link>
      }
    />
  );
}

export function ServerErrorPage({
  requestId,
  onRetry,
}: {
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorLayout
      code="500"
      illustration="brokenGear"
      title="Something broke on our side"
      description="It's not you. Try again in a moment; if it keeps happening, share the reference below with support."
      actions={
        <>
          <button
            type="button"
            className={buttonVariants()}
            onClick={onRetry ?? (() => window.location.reload())}
          >
            <RefreshCw /> Try again
          </button>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            <Home /> Home
          </Link>
        </>
      }
      detail={requestId ? <>Reference: {requestId}</> : undefined}
    />
  );
}

/** Router-level error boundary: unknown routes, failed lazy chunks and render crashes. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (isRouteErrorResponse(error) && error.status === 403) return <ForbiddenPage />;
  // A new deploy can remove the chunk an open tab expects; a reload fetches the new one.
  const message = error instanceof Error ? error.message : '';
  if (
    /Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)
  ) {
    window.location.reload();
    return null;
  }
  if (import.meta.env.DEV) console.error(error);
  return <ServerErrorPage />;
}
