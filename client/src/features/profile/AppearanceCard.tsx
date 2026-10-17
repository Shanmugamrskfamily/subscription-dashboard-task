import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/card';
import { cn } from '../../lib/cn';
import { useTheme } from '../theme/theme';
import type { ThemeChoice } from '../theme/theme';

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * A tiny window drawn in the theme it stands for. These colours are fixed on purpose:
 * the light preview has to look light even while the app is dark, and the other way round.
 */
function Preview({ dark }: { dark: boolean }) {
  return (
    <span
      className={cn('flex h-full flex-col gap-1 p-1.5', dark ? 'bg-slate-900' : 'bg-slate-100')}
    >
      <span className={cn('h-1.5 w-3/4 rounded-full', dark ? 'bg-slate-600' : 'bg-slate-300')} />
      <span className="h-1.5 w-1/2 rounded-full bg-indigo-500" />
      <span className={cn('mt-auto h-3 rounded', dark ? 'bg-slate-800' : 'bg-white')} />
    </span>
  );
}

export function AppearanceCard() {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <Card>
      <CardHeader title="Appearance" description="Choose how PlanPilot looks on this browser." />
      {/* Native radios: arrow keys move between options, and the choice is announced. */}
      <fieldset>
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {THEMES.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={choice === t.value}
                onChange={() => setChoice(t.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'block rounded-2xl border-[1.5px] border-line p-1.5 transition-colors hover:border-line-strong sm:p-2',
                  'peer-checked:border-brand peer-checked:bg-brand-soft',
                  'peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25',
                )}
              >
                <span
                  className="flex h-14 overflow-hidden rounded-xl border border-line"
                  aria-hidden
                >
                  {t.value === 'system' ? (
                    <>
                      <span className="w-1/2">
                        <Preview dark={false} />
                      </span>
                      <span className="w-1/2">
                        <Preview dark />
                      </span>
                    </>
                  ) : (
                    <span className="w-full">
                      <Preview dark={t.value === 'dark'} />
                    </span>
                  )}
                </span>
                <span className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-extrabold">
                  <t.icon className="size-4" aria-hidden /> {t.label}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-[13px] text-muted" aria-live="polite">
        {choice === 'system'
          ? `Following your device, which is using ${resolved} mode right now.`
          : `Using ${resolved} mode on this browser.`}
      </p>
    </Card>
  );
}
