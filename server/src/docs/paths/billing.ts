import { ERROR_CODES as C } from '@planpilot/shared';
import * as ex from '../examples';
import { CUSTOMER, PUBLIC, defineOperation } from '../operation';
import { flagResult, parameterRef, schemaRef } from '../refs';

const PLAN_CHANGED =
  'The current plan changed in the meantime (another tab or an administrator); review and try again.';

/** Pro Annual → Pro paid for entirely by credit, so it activates at once. */
const activatedByCredit = {
  activated: true,
  subscription: {
    ...ex.subscription,
    changeType: 'downgrade',
    amountPaid: 0,
    startDate: ex.downgradeQuote.startDate,
    endDate: ex.downgradeQuote.endDate,
    daysLeft: 296,
    totalDays: 296,
    createdAt: ex.downgradeQuote.startDate,
  },
  quote: ex.downgradeQuote,
};

export const planOperations = [
  defineOperation({
    method: 'get',
    path: '/plans',
    operationId: 'listPlans',
    tag: 'Plans',
    summary: 'List plans',
    description:
      'The plans on sale, by tier then price. Public so the pricing page works before sign-in; cacheable for 60 seconds (`Cache-Control: public, max-age=60`). Archived plans are not listed.',
    access: PUBLIC,
    success: {
      description: 'Active plans.',
      data: { type: 'array', items: schemaRef('Plan') },
      example: ex.planList,
    },
  }),
];

export const subscriptionOperations = [
  defineOperation({
    method: 'get',
    path: '/my-subscription',
    operationId: 'getMySubscription',
    tag: 'Subscriptions',
    summary: 'My subscription',
    description:
      'The signed-in customer’s active plan with usage and limits. Without an active plan, `status` is that of the latest subscription (or `none`), `lastSubscription` is filled for a Renew button and `readOnly` is true. A plan past its end date is expired on read, even if the background job has not run yet.',
    access: CUSTOMER,
    success: {
      description: 'The customer’s plan state.',
      data: schemaRef('MySubscription'),
      examples: {
        active: {
          summary: 'Active plan',
          value: { success: true, data: ex.mySubscription },
        },
        lapsed: {
          summary: 'No active plan (read-only)',
          value: { success: true, data: ex.cancelledSubscription },
        },
      },
    },
  }),

  defineOperation({
    method: 'post',
    path: '/my-subscription/cancel',
    operationId: 'cancelMySubscription',
    tag: 'Subscriptions',
    summary: 'Cancel my plan',
    description:
      'Ends the active plan now. Unused time is not refunded and the workspace becomes read-only until a new plan is bought.',
    access: CUSTOMER,
    success: {
      description: 'Cancelled; the updated plan state.',
      data: schemaRef('MySubscription'),
      example: ex.cancelledSubscription,
    },
    errors: [C.NO_ACTIVE_SUBSCRIPTION],
  }),

  defineOperation({
    method: 'get',
    path: '/subscribe/{planId}/preview',
    operationId: 'previewPlanChange',
    tag: 'Subscriptions',
    summary: 'Price a plan change',
    description:
      'What subscribing to this plan would cost right now, without changing anything. Credit is the unused share of what the current period was worth; the new plan always starts now. Leftover credit after a downgrade turns into bonus days.',
    access: CUSTOMER,
    parameters: [parameterRef('PlanId')],
    success: {
      description: 'The quote.',
      data: schemaRef('ProrationQuote'),
      examples: {
        upgrade: {
          summary: 'Starter → Pro half-way through the month',
          value: { success: true, data: ex.upgradeQuote },
        },
        downgrade: {
          summary: 'Pro Annual → Pro, credit covers it',
          value: { success: true, data: ex.downgradeQuote },
        },
      },
    },
    errors: [C.PLAN_NOT_FOUND, C.PLAN_INACTIVE, C.ALREADY_SUBSCRIBED],
  }),

  defineOperation({
    method: 'post',
    path: '/subscribe/{planId}',
    operationId: 'subscribeToPlan',
    tag: 'Subscriptions',
    summary: 'Subscribe or switch plan',
    description: [
      'Subscribes to a plan, or switches to it with proration (see the preview).',
      '- **Nothing due** (credit covers the price): the new plan is active at once. `201` with `activated: true`.',
      '- **Payment due**: a Razorpay order for `amountDue` is created. `200` with `activated: false` and `checkout`. Open Razorpay Checkout with `checkout.keyId` and `checkout.orderId`, then confirm with `POST /payments/verify`, or report a dismissed checkout with `POST /payments/{orderId}/fail`. The current plan stays active until the payment is verified.',
      'The amount is fixed on the server when the order is created; the client never sends a price.',
    ].join('\n'),
    access: CUSTOMER,
    limiter: 'payments',
    parameters: [parameterRef('PlanId')],
    success: [
      {
        status: 201,
        description: 'Activated without payment.',
        data: schemaRef('SubscribeActivated'),
        example: activatedByCredit,
      },
      {
        status: 200,
        description: 'Payment due: complete the checkout.',
        data: schemaRef('SubscribeCheckout'),
        example: { activated: false, checkout: ex.checkout, quote: ex.upgradeQuote },
      },
    ],
    errors: [
      C.PLAN_NOT_FOUND,
      C.PLAN_INACTIVE,
      C.ALREADY_SUBSCRIBED,
      [C.CONFLICT, PLAN_CHANGED],
      C.GATEWAY_ERROR,
    ],
  }),
];

export const paymentOperations = [
  defineOperation({
    method: 'post',
    path: '/payments/verify',
    operationId: 'verifyPayment',
    tag: 'Payments',
    summary: 'Confirm a payment',
    description:
      'Send what Razorpay Checkout returned. The server checks the signature (HMAC-SHA256 of `order_id|payment_id` with the key secret, compared in constant time) and activates the plan in a transaction that also closes the previous one. Idempotent: verifying the same payment again returns the plan it activated with `alreadyProcessed: true`.',
    access: CUSTOMER,
    limiter: 'payments',
    body: {
      schema: schemaRef('VerifyPaymentRequest'),
      example: {
        razorpay_order_id: ex.checkout.orderId,
        razorpay_payment_id: ex.checkout.simulation?.paymentId,
        razorpay_signature: ex.checkout.simulation?.signature,
      },
    },
    success: {
      description: 'Payment verified; the new plan is active.',
      data: schemaRef('VerifyPaymentResult'),
      example: { subscription: ex.subscription, alreadyProcessed: false },
    },
    errors: [
      [C.NOT_FOUND, 'No checkout with this order id belongs to you.'],
      [C.PLAN_NOT_FOUND, 'The plan was deleted after the checkout started.'],
      C.PAYMENT_FAILED,
      [
        C.PAYMENT_VERIFICATION_FAILED,
        'The signature does not match; the payment is marked failed and the customer notified.',
      ],
      [C.CONFLICT, `The payment is still being processed, or: ${PLAN_CHANGED}`],
      [C.ALREADY_SUBSCRIBED, 'Another plan was activated at the same moment.'],
    ],
  }),

  defineOperation({
    method: 'post',
    path: '/payments/{orderId}/fail',
    operationId: 'reportPaymentFailed',
    tag: 'Payments',
    summary: 'Report a closed checkout',
    description:
      'Records that the checkout was dismissed or failed, so billing history and analytics stay accurate, and notifies the customer. Idempotent: an unknown, paid or already failed order is left alone and still returns `recorded: true`.',
    access: CUSTOMER,
    parameters: [parameterRef('OrderId')],
    body: {
      schema: schemaRef('PaymentFailedRequest'),
      required: false,
      example: { reason: 'Checkout closed by the customer' },
    },
    success: {
      description: 'Recorded.',
      data: flagResult('recorded', 'Always true.'),
      example: { recorded: true },
    },
  }),
];
