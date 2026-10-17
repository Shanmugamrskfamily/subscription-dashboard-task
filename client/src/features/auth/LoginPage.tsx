import { ACCOUNT_BLOCKING_CODES, ERROR_CODES, loginSchema } from '@planpilot/shared';
import type { LoginInput } from '@planpilot/shared';
import { Form, Formik } from 'formik';
import type { FormikHelpers } from 'formik';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { homeFor } from '../../app/guards';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { Button } from '../../components/ui/button';
import {
  applyServerErrors,
  FocusFirstError,
  FormAlert,
  PasswordField,
  TextField,
} from '../../components/ui/form';
import { cn } from '../../lib/cn';
import { safeNext } from '../../lib/navigation';
import { LockoutBanner, RestrictionBanner } from './AccountNotice';
import { useLoginMutation } from './authApi';
import { restrictionCleared } from './authSlice';
import { AuthLayout } from './AuthLayout';
import { DEMO_ACCOUNTS, RESTRICTED_ACCOUNTS } from './demoAccounts';
import type { DemoAccount } from './demoAccounts';

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const restriction = useAppSelector((s) => s.auth.restriction);
  const [login] = useLoginMutation();
  const [lockedFor, setLockedFor] = useState<number | null>(null);
  const [shake, setShake] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);
  const clearLock = useCallback(() => setLockedFor(null), []);

  const onSubmit = async (values: LoginInput, helpers: FormikHelpers<LoginInput>) => {
    helpers.setStatus(null);
    dispatch(restrictionCleared());
    try {
      const session = await login(loginSchema.cast(values)).unwrap();
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}!`);
      navigate(safeNext(params.get('next')) ?? homeFor(session.user.role), { replace: true });
    } catch (e) {
      const error = errorOf(e);
      if (!error) return;
      if (error.code === ERROR_CODES.ACCOUNT_LOCKED) {
        setLockedFor(Number(error.meta.retryAfterSeconds) || 900);
      } else if (ACCOUNT_BLOCKING_CODES.includes(error.code as never)) {
        // The restriction banner (from the store) explains it.
      } else if (error.code === ERROR_CODES.INVALID_CREDENTIALS) {
        const left = Number(error.meta.attemptsLeft);
        helpers.setStatus(
          left > 0 && left <= 2
            ? `${error.message} ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute pause.`
            : error.message,
        );
        setShake((n) => n + 1);
      } else {
        applyServerErrors(error, helpers);
      }
    }
  };

  const tryDemo = (
    account: DemoAccount,
    setValues: (v: LoginInput) => unknown,
    submit: () => Promise<unknown>,
  ) => {
    void Promise.resolve(setValues({ email: account.email, password: account.password })).then(() =>
      submit(),
    );
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your plan and workspace."
      footer={
        <>
          New to PlanPilot?{' '}
          <Link to="/register" className="font-extrabold text-brand-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Formik<LoginInput>
        initialValues={{ email: params.get('email') ?? '', password: '' }}
        validationSchema={loginSchema}
        onSubmit={onSubmit}
      >
        {({ isSubmitting, status, setValues, submitForm }) => (
          <>
            <Form noValidate className="space-y-4">
              <FocusFirstError />
              {restriction && <RestrictionBanner restriction={restriction} />}
              {lockedFor !== null && <LockoutBanner seconds={lockedFor} onDone={clearLock} />}
              <div key={shake} className={cn(shake > 0 && 'motion-safe:animate-shake')}>
                <FormAlert message={status as string | null} />
              </div>
              <TextField
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                icon={<Mail />}
              />
              <PasswordField
                name="password"
                label="Password"
                autoComplete="current-password"
                placeholder="Your password"
                icon={<Lock />}
              />
              <Button
                ref={submitRef}
                type="submit"
                size="lg"
                className="w-full"
                loading={isSubmitting}
                disabled={lockedFor !== null}
              >
                Sign in <ArrowRight />
              </Button>
            </Form>

            <section aria-labelledby="demo-title" className="mt-7">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <h2 id="demo-title" className="text-[13px] font-extrabold text-muted">
                  Try a demo account
                </h2>
                <span className="h-px flex-1 bg-line" />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      disabled={isSubmitting || lockedFor !== null}
                      onClick={() => tryDemo(a, setValues, submitForm)}
                      className="flex min-h-14 w-full cursor-pointer flex-col rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="text-[13px] font-extrabold">{a.label}</span>
                      <span className="text-xs text-muted">{a.shows}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-muted">Restricted accounts:</span>
                {RESTRICTED_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    disabled={isSubmitting}
                    title={a.shows}
                    onClick={() => tryDemo(a, setValues, submitForm)}
                    className="min-h-9 cursor-pointer rounded-full border border-line bg-surface px-3 text-xs font-extrabold text-muted hover:border-danger/40 hover:text-danger-ink"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </Formik>
    </AuthLayout>
  );
}
