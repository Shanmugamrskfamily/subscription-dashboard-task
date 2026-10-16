import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Which shell a page renders in; the admin shell already pads its content. */
export const ShellContext = createContext<'app' | 'admin'>('app');

export function Page({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const shell = useContext(ShellContext);
  return (
    <div
      className={cn(
        shell === 'app' && 'mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8',
        className,
      )}
    >
      {title && <title>{`${title} · PlanPilot`}</title>}
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
