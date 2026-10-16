import { registerFormSchema, registerSchema } from '@planpilot/shared';
import type { RegisterFormValues } from '@planpilot/shared';
import { Form, Formik } from 'formik';
import type { FormikHelpers } from 'formik';
import { ArrowRight, Lock, Mail, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { Button } from '../../components/ui/button';
import {
  applyServerErrors,
  FocusFirstError,
  FormAlert,
  PasswordField,
  TextField,
} from '../../components/ui/form';
import { useRegisterMutation } from './authApi';
import { AuthLayout } from './AuthLayout';

const INITIAL: RegisterFormValues = { name: '', email: '', password: '', confirmPassword: '' };

export default function RegisterPage() {
  const navigate = useNavigate();
  const [register] = useRegisterMutation();

  const onSubmit = async (
    values: RegisterFormValues,
    helpers: FormikHelpers<RegisterFormValues>,
  ) => {
    helpers.setStatus(null);
    try {
      // Cast applies the same cleaning the server does (trim, strip tags, lower-case email).
      const { name, email, password } = registerSchema.cast(values, { stripUnknown: true });
      const session = await register({ name, email, password }).unwrap();
      toast.success(
        `Welcome aboard, ${session.user.name.split(' ')[0]}! Pick a plan to unlock your workspace.`,
      );
      navigate('/plans', { replace: true });
    } catch (e) {
      const error = errorOf(e);
      if (error) applyServerErrors(error, helpers);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start in seconds. Pick a plan whenever you're ready."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-extrabold text-brand-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Formik<RegisterFormValues>
        initialValues={INITIAL}
        validationSchema={registerFormSchema}
        onSubmit={onSubmit}
      >
        {({ isSubmitting, status }) => (
          <Form noValidate className="space-y-4">
            <FocusFirstError />
            <FormAlert message={status as string | null} />
            <TextField
              name="name"
              label="Full name"
              autoComplete="name"
              placeholder="Priya Sharma"
              icon={<UserRound />}
            />
            <TextField
              name="email"
              label="Work email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              icon={<Mail />}
            />
            <PasswordField
              name="password"
              label="Password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              hint="Use 8+ characters with upper and lower case letters and a number."
              icon={<Lock />}
              showStrength
            />
            <PasswordField
              name="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Type it again"
              icon={<Lock />}
            />
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Create account <ArrowRight />
            </Button>
            <p className="text-center text-xs text-subtle">
              Your password is hashed with bcrypt and never stored in plain text.
            </p>
          </Form>
        )}
      </Formik>
    </AuthLayout>
  );
}
