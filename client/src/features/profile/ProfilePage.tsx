import { changePasswordFormSchema, updateProfileSchema } from '@planpilot/shared';
import type { ChangePasswordFormValues, UpdateProfileInput, UserDto } from '@planpilot/shared';
import { Form, Formik } from 'formik';
import type { FormikHelpers } from 'formik';
import { CalendarDays, KeyRound, Shield, UserRound } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import type { Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { useAppSelector } from '../../app/store';
import { Page, PageTitle } from '../../components/layout/Page';
import { AccountBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { Avatar } from '../../components/ui/feedback';
import {
  applyServerErrors,
  FocusFirstError,
  FormAlert,
  PasswordField,
  TextField,
} from '../../components/ui/form';
import { formatDate, plural } from '../../lib/format';
import { useChangePasswordMutation, useUpdateProfileMutation } from '../auth/authApi';
import { AppearanceCard } from './AppearanceCard';
import { SessionsCard } from './SessionsCard';

const gridVariants: Variants = { show: { transition: { staggerChildren: 0.06 } } };
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  // Signing out everywhere clears the user a moment before the redirect to sign in.
  if (!user) return null;

  return (
    <Page title="Profile and security">
      <PageTitle
        title="Profile and security"
        description="Your details, password, signed-in devices and theme."
      />
      {/* Container query: in the admin shell the sidebar takes room the viewport width hides. */}
      <MotionConfig reducedMotion="user">
        <div className="@container">
          <motion.div
            className="grid gap-5 @4xl:grid-cols-2"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            {/* The first row shares one height; the second keeps natural heights. */}
            <motion.div variants={cardVariants} className="min-w-0">
              <ProfileCard user={user} />
            </motion.div>
            <motion.div variants={cardVariants} className="min-w-0">
              <PasswordCard email={user.email} />
            </motion.div>
            <motion.div variants={cardVariants} className="min-w-0 self-start">
              <SessionsCard />
            </motion.div>
            <motion.div variants={cardVariants} className="min-w-0 self-start">
              <AppearanceCard />
            </motion.div>
          </motion.div>
        </div>
      </MotionConfig>
    </Page>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Shield;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-extrabold text-muted">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="mt-1 truncate font-extrabold">{children}</dd>
    </div>
  );
}

function ProfileCard({ user }: { user: UserDto }) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const submit = async (values: UpdateProfileInput, helpers: FormikHelpers<UpdateProfileInput>) => {
    const body = updateProfileSchema.cast(values);
    try {
      const updated = await updateProfile(body).unwrap();
      helpers.resetForm({ values: { name: updated.name } });
      toast.success('Name updated');
    } catch (e) {
      const err = errorOf(e);
      if (err) applyServerErrors(err, helpers);
    }
  };

  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="relative h-24 overflow-hidden bg-brand-gradient" aria-hidden>
        <span className="absolute -top-14 -right-8 size-40 rounded-full bg-white/10" />
        <span className="absolute -bottom-20 left-1/4 size-36 rounded-full bg-white/10" />
      </div>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <Avatar name={user.name} className="size-20 text-2xl ring-4 ring-surface" />
          <AccountBadge status={user.status} />
        </div>
        <h2 className="mt-3 truncate text-xl font-black tracking-tight">{user.name}</h2>
        <p className="truncate text-sm text-muted" title={user.email}>
          {user.email}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Detail icon={user.role === 'admin' ? Shield : UserRound} label="Role">
            {user.role === 'admin' ? 'Admin' : 'Customer'}
          </Detail>
          <Detail icon={CalendarDays} label="Member since">
            {formatDate(user.createdAt)}
          </Detail>
        </dl>

        <Formik
          initialValues={{ name: user.name }}
          enableReinitialize
          validationSchema={updateProfileSchema}
          onSubmit={submit}
        >
          {({ dirty, status, submitCount, resetForm }) => (
            <Form noValidate className="mt-5 border-t border-line pt-5">
              <h3 className="font-extrabold">Edit name</h3>
              <p className="text-[13px] text-muted">This is how you appear across PlanPilot.</p>
              <div className="mt-3 space-y-3">
                <FocusFirstError />
                {status && (
                  <div key={submitCount} className="animate-shake">
                    <FormAlert message={status} />
                  </div>
                )}
                <TextField name="name" label="Full name" autoComplete="name" maxLength={60} />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  {dirty && (
                    <Button variant="ghost" onClick={() => resetForm()}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" loading={isLoading} disabled={!dirty}>
                    Save name
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </Card>
  );
}

const emptyPasswords: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function PasswordCard({ email }: { email: string }) {
  const [changePassword, { isLoading }] = useChangePasswordMutation();

  const submit = async (
    values: ChangePasswordFormValues,
    helpers: FormikHelpers<ChangePasswordFormValues>,
  ) => {
    try {
      // The confirmation is checked here; the server only takes the two passwords.
      const { otherSessionsRevoked } = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();
      helpers.resetForm();
      toast.success(
        otherSessionsRevoked
          ? `Password changed. ${plural(otherSessionsRevoked, 'other device')} signed out.`
          : 'Password changed.',
      );
    } catch (e) {
      // A wrong current password comes back as an error on that field.
      const err = errorOf(e);
      if (err) applyServerErrors(err, helpers);
    }
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Change password"
        description="Changing it signs you out on your other devices."
        action={
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-ink">
            <KeyRound className="size-5" aria-hidden />
          </span>
        }
      />
      <Formik
        initialValues={emptyPasswords}
        validationSchema={changePasswordFormSchema}
        onSubmit={submit}
      >
        {({ status, submitCount }) => (
          <Form noValidate className="flex flex-1 flex-col gap-4">
            {/* Lets password managers file the new password under the right account. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
            <FocusFirstError />
            {status && (
              <div key={submitCount} className="animate-shake">
                <FormAlert message={status} />
              </div>
            )}
            <PasswordField
              name="currentPassword"
              label="Current password"
              autoComplete="current-password"
            />
            <PasswordField
              name="newPassword"
              label="New password"
              autoComplete="new-password"
              hint="At least 8 characters, with upper and lower case letters and a number."
              showStrength
            />
            <PasswordField
              name="confirmPassword"
              label="Confirm new password"
              autoComplete="new-password"
            />
            <div className="mt-auto flex pt-1 sm:justify-end">
              <Button type="submit" loading={isLoading} className="w-full sm:w-auto">
                {!isLoading && <KeyRound aria-hidden />} Update password
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </Card>
  );
}
