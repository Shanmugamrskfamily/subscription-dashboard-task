import { useId } from 'react';
import { cn } from '../../lib/cn';

/** PlanPilot mark: rising plan bars and a paper plane on the brand gradient. */
export function LogoMark({
  size = 36,
  className,
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="PlanPilot"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#g${id})`} />
      <g
        className={
          animated
            ? '[&>rect]:origin-bottom [&>rect]:motion-safe:animate-[bars_1.4s_ease-in-out_infinite]'
            : undefined
        }
      >
        <rect
          x="12"
          y="41"
          width="7.5"
          height="11"
          rx="2.6"
          fill="#fff"
          fillOpacity=".5"
          style={{ animationDelay: '0s' }}
        />
        <rect
          x="22.5"
          y="35"
          width="7.5"
          height="17"
          rx="2.6"
          fill="#fff"
          fillOpacity=".72"
          style={{ animationDelay: '.15s' }}
        />
        <rect
          x="33"
          y="29"
          width="7.5"
          height="23"
          rx="2.6"
          fill="#fff"
          style={{ animationDelay: '.3s' }}
        />
      </g>
      <g className={animated ? 'motion-safe:animate-[plane_1.4s_ease-in-out_infinite]' : undefined}>
        <path d="M53.5 9.5 31.5 19.2l8.6 3.4 3.5 8.9z" fill="#fff" />
        <path d="m53.5 9.5-13.4 13.1 1.5 4.6z" fill="#C7D2FE" />
      </g>
      <circle cx="26" cy="24.5" r="1.7" fill="#FCD34D" />
      <circle cx="20.5" cy="28.5" r="1.3" fill="#FCD34D" fillOpacity=".7" />
    </svg>
  );
}

export function Logo({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-[19px] font-black tracking-tight',
        className,
      )}
    >
      <LogoMark size={size} />
      <span>
        Plan
        <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-[linear-gradient(135deg,#a5b4fc,#c4b5fd)]">
          Pilot
        </span>
      </span>
    </span>
  );
}
