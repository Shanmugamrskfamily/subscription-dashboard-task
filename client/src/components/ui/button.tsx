import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 rounded-xl font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color,color,opacity] duration-200 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 cursor-pointer [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand-gradient text-white shadow-brand hover:brightness-110 hover:shadow-pop',
        secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
        outline:
          'border-[1.5px] border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2',
        ghost: 'text-ink hover:bg-surface-2',
        danger: 'bg-danger text-white hover:brightness-110',
        'danger-ghost': 'text-danger-ink hover:bg-danger-soft',
        link: 'text-brand-ink underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-9 px-3 text-[13px]',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-11 p-0',
        'icon-sm': 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Shows a spinner and blocks double submits while `loading` is true. */
export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
