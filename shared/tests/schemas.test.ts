import { describe, expect, it } from 'vitest';
import {
  adminSubscriptionQuerySchema,
  assignPlanSchema,
  changePasswordFormSchema,
  extendSubscriptionSchema,
  loginSchema,
  planFormSchema,
  planSchema,
  projectSchema,
  registerFormSchema,
  registerSchema,
  userStatusSchema,
  verifyPaymentSchema,
} from '../src/schemas';

const errorsOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return [];
  } catch (error) {
    return (error as { errors: string[] }).errors;
  }
};

describe('auth schemas', () => {
  it('casts and cleans a registration', async () => {
    const value = await registerSchema.validate({
      name: '  <b>Priya</b>  Sharma ',
      email: ' Priya@Example.COM ',
      password: 'Secure123',
    });
    expect(value).toEqual({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      password: 'Secure123',
    });
  });

  it('lists every password rule that fails', async () => {
    const errors = await errorsOf(() =>
      registerSchema.validate(
        { name: 'Priya', email: 'p@x.co', password: 'short' },
        { abortEarly: false },
      ),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Use at least 8 characters',
        'Add an uppercase letter',
        'Add a number',
      ]),
    );
  });

  it('rejects names made of symbols', async () => {
    const errors = await errorsOf(() =>
      registerSchema.validate({ name: '{$gt:1}', email: 'p@x.co', password: 'Secure123' }),
    );
    expect(errors[0]).toMatch(/letters/);
  });

  it('checks the confirmation only in the form schema', async () => {
    const errors = await errorsOf(() =>
      registerFormSchema.validate({
        name: 'Priya',
        email: 'p@x.co',
        password: 'Secure123',
        confirmPassword: 'Secure124',
      }),
    );
    expect(errors).toEqual(['Passwords do not match']);
  });

  it('strips unknown keys such as role from registrations', async () => {
    const value = await registerSchema.validate(
      { name: 'Priya', email: 'p@x.co', password: 'Secure123', role: 'admin' },
      { stripUnknown: true },
    );
    expect(value).not.toHaveProperty('role');
  });

  it('accepts any stored password at login', async () => {
    await expect(loginSchema.validate({ email: 'p@x.co', password: 'old' })).resolves.toBeTruthy();
  });

  it('refuses a new password equal to the current one', async () => {
    const errors = await errorsOf(() =>
      changePasswordFormSchema.validate({
        currentPassword: 'Secure123',
        newPassword: 'Secure123',
        confirmPassword: 'Secure123',
      }),
    );
    expect(errors).toEqual(['New password must differ from the current one']);
  });
});

describe('plan schemas', () => {
  const base = {
    name: 'Pro',
    description: 'For teams',
    durationDays: 30,
    features: ['50 GB storage'],
    limits: { projects: 25, teamMembers: null },
    tier: 2,
  };

  it('accepts a valid plan in paise with unlimited members', async () => {
    const plan = await planSchema.validate({ ...base, price: 79900 });
    expect(plan.limits.teamMembers).toBeNull();
    expect(plan.isActive).toBe(true);
  });

  it('rejects fractional paise and empty features', async () => {
    const errors = await errorsOf(() =>
      planSchema.validate({ ...base, price: 79900.5, features: [] }, { abortEarly: false }),
    );
    expect(errors).toEqual(
      expect.arrayContaining(['Price must be in whole paise', 'Add at least one feature']),
    );
  });

  it('allows at most two decimals in the rupee form', async () => {
    await expect(planFormSchema.validate({ ...base, priceRupees: 799.99 })).resolves.toBeTruthy();
    const errors = await errorsOf(() => planFormSchema.validate({ ...base, priceRupees: 799.999 }));
    expect(errors).toEqual(['Use at most 2 decimal places']);
  });
});

describe('admin schemas', () => {
  it('fills defaults for an empty subscriptions query', async () => {
    const query = await adminSubscriptionQuerySchema.validate({});
    expect(query).toMatchObject({
      page: 1,
      pageSize: 10,
      status: 'all',
      sort: '-createdAt',
      format: 'json',
    });
  });

  it('treats an empty plan filter as no filter and checks the date order', async () => {
    const query = await adminSubscriptionQuerySchema.validate({ planId: '' });
    expect(query.planId).toBeUndefined();
    const errors = await errorsOf(() =>
      adminSubscriptionQuerySchema.validate({ from: '2026-10-10', to: '2026-10-01' }),
    );
    expect(errors).toEqual(['End date must be after the start date']);
  });

  it('rejects page sizes outside the allowed list', async () => {
    await expect(adminSubscriptionQuerySchema.validate({ pageSize: 1000 })).rejects.toThrow();
  });

  it('needs exactly one of days or end date to extend a plan', async () => {
    await expect(
      extendSubscriptionSchema.validate({ days: 7, reason: 'Goodwill credit' }),
    ).resolves.toBeTruthy();
    const both = await errorsOf(() =>
      extendSubscriptionSchema.validate({
        days: 7,
        endDate: '2027-01-01',
        reason: 'Goodwill credit',
      }),
    );
    expect(both).toEqual(['Give either a number of days or a new end date']);
    const neither = await errorsOf(() =>
      extendSubscriptionSchema.validate({ reason: 'Goodwill credit' }),
    );
    expect(neither).toEqual(['Give either a number of days or a new end date']);
  });

  it('requires a reason and a future access date when changing status', async () => {
    const errors = await errorsOf(() =>
      userStatusSchema.validate(
        { status: 'blocked', reason: 'no', accessExpiresAt: '2020-01-01' },
        { abortEarly: false },
      ),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Give a reason of at least 5 characters',
        'Pick a date in the future',
      ]),
    );
  });

  it('validates object ids', async () => {
    await expect(
      assignPlanSchema.validate({ planId: 'nope', reason: 'Manual upgrade' }),
    ).rejects.toThrow('Invalid plan id');
  });
});

describe('billing and workspace schemas', () => {
  it('accepts a Razorpay success payload', async () => {
    await expect(
      verifyPaymentSchema.validate({
        razorpay_order_id: 'order_Ox8u12345',
        razorpay_payment_id: 'pay_Ox8u12345',
        razorpay_signature: 'a'.repeat(64),
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects an injected order id', async () => {
    await expect(
      verifyPaymentSchema.validate({
        razorpay_order_id: 'order_1"; drop',
        razorpay_payment_id: 'pay_Ox8u12345',
        razorpay_signature: 'a'.repeat(64),
      }),
    ).rejects.toThrow('Invalid order id');
  });

  it('defaults a project colour and cleans its name', async () => {
    const project = await projectSchema.validate({ name: ' <i>Website</i> redesign ' });
    expect(project).toEqual({ name: 'Website redesign', description: '', color: 'indigo' });
  });
});
