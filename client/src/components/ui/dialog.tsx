import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Hide the close button for decisions the user must make (idle sign-out). */
  dismissible?: boolean;
}

const overlay =
  'fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0';

/**
 * Centred dialog on larger screens, bottom sheet on phones. Focus is trapped inside,
 * Escape closes it, and focus returns to the trigger afterwards (Radix).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: ModalProps) {
  return (
    <D.Root
      open={open}
      onOpenChange={dismissible ? onOpenChange : (next) => next && onOpenChange(next)}
    >
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            'fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden border border-line bg-surface shadow-pop outline-none',
            'inset-x-0 bottom-0 rounded-t-3xl safe-bottom',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-0',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom-8 sm:data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
            className,
          )}
        >
          <div
            className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-line sm:hidden"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <D.Title className="text-lg leading-tight font-extrabold sm:text-xl">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Dialog'}
                </D.Description>
              )}
            </div>
            {dismissible && (
              <D.Close
                className="-mt-1 -mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="size-5" />
              </D.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Right-hand panel for details (admin user and subscription drawers). Full width on phones. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: Omit<ModalProps, 'dismissible' | 'className'>) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-pop outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="truncate text-lg font-extrabold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 truncate text-sm text-muted">
                  {description}
                </D.Description>
              ) : (
                <D.Description className="sr-only">Details</D.Description>
              )}
            </div>
            <D.Close
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Close"
            >
              <X className="size-5" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="border-t border-line px-5 py-4 safe-bottom">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
