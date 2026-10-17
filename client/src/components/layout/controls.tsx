import { LayoutDashboard, LogOut, Monitor, Moon, Shield, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAppSelector } from '../../app/store';
import { useLogoutMutation } from '../../features/auth/authApi';
import { useTheme } from '../../features/theme/theme';
import type { ThemeChoice } from '../../features/theme/theme';
import { Avatar } from '../ui/feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/menu';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-ink shadow-card hover:bg-surface-2"
      aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolved === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function UserMenu() {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const { choice, setChoice } = useTheme();
  const [logout] = useLogoutMutation();
  if (!user) return null;
  return (
    <Menu>
      <MenuTrigger
        className="flex cursor-pointer items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2"
        aria-label="Account menu"
      >
        <Avatar name={user.name} />
        <span className="hidden max-w-32 truncate text-sm font-extrabold md:block">
          {user.name.split(' ')[0]}
        </span>
      </MenuTrigger>
      <MenuContent>
        <div className="px-3 py-2">
          <p className="truncate font-extrabold">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          {user.role === 'admin' && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-black text-brand-ink">
              <Shield className="size-3" /> Admin
            </span>
          )}
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => navigate(user.role === 'admin' ? '/admin' : '/dashboard')}>
          <LayoutDashboard /> {user.role === 'admin' ? 'Admin overview' : 'Dashboard'}
        </MenuItem>
        <MenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> Profile and security
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <div className="flex gap-1 px-1.5 pb-1.5" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={choice === t.value}
              onClick={() => setChoice(t.value)}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-extrabold ${choice === t.value ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-surface-2'}`}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
        <MenuSeparator />
        <MenuItem danger onSelect={() => void logout()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
