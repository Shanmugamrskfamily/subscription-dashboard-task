import { DropdownMenu as M, Tabs as T, Tooltip as Tip } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  className,
  align = 'end',
  ...props
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-50 min-w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  danger,
  ...props
}: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-bold outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted',
        danger && 'text-danger-ink [&_svg]:text-danger-ink',
        className,
      )}
      {...props}
    />
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="px-3 py-2 text-xs font-black tracking-wide text-subtle uppercase">
    {children}
  </M.Label>
);

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return (
    <T.List className={cn('inline-flex gap-1 rounded-xl bg-surface-2 p-1', className)} {...props} />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-sm font-extrabold text-muted transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-card [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

/** Tooltip that also works with keyboard focus; never the only way to reach information. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tip.Provider delayDuration={250}>
      <Tip.Root>
        <Tip.Trigger asChild>{children}</Tip.Trigger>
        <Tip.Portal>
          <Tip.Content
            sideOffset={6}
            className="z-50 max-w-64 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-pop dark:bg-slate-100 dark:text-slate-900"
          >
            {content}
          </Tip.Content>
        </Tip.Portal>
      </Tip.Root>
    </Tip.Provider>
  );
}

/** Pill-style switch between a few options (date ranges, billing cycle). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex gap-1 rounded-xl bg-surface-2 p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-9 flex-1 cursor-pointer rounded-lg px-3 text-[13px] font-extrabold whitespace-nowrap text-muted transition-colors',
            value === o.value && 'bg-surface text-ink shadow-card',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
