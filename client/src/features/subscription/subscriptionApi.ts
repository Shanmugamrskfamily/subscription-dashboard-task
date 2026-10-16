import type {
  MySubscriptionDto,
  PaymentDto,
  PlanDto,
  ProrationQuote,
  SubscribeResponse,
  SubscriptionDto,
  UsageDto,
  VerifyPaymentInput,
} from '@planpilot/shared';
import { api } from '../../api/apiSlice';

const AFTER_PLAN_CHANGE = ['MySubscription', 'Payments', 'Notifications'] as const;

export const subscriptionApi = api.injectEndpoints({
  endpoints: (build) => ({
    plans: build.query<PlanDto[], void>({
      query: () => ({ url: '/plans' }),
      providesTags: ['Plans'],
    }),
    mySubscription: build.query<MySubscriptionDto, void>({
      query: () => ({ url: '/my-subscription' }),
      providesTags: ['MySubscription'],
    }),
    preview: build.query<ProrationQuote, string>({
      query: (planId) => ({ url: `/subscribe/${planId}/preview` }),
      keepUnusedDataFor: 0,
    }),
    subscribe: build.mutation<SubscribeResponse, string>({
      query: (planId) => ({ url: `/subscribe/${planId}`, method: 'POST' }),
      invalidatesTags: (result) => (result?.activated ? [...AFTER_PLAN_CHANGE] : []),
    }),
    verifyPayment: build.mutation<
      { subscription: SubscriptionDto; alreadyProcessed: boolean },
      VerifyPaymentInput
    >({
      query: (body) => ({ url: '/payments/verify', method: 'POST', body }),
      invalidatesTags: [...AFTER_PLAN_CHANGE],
    }),
    paymentFailed: build.mutation<{ recorded: boolean }, { orderId: string; reason: string }>({
      query: ({ orderId, reason }) => ({
        url: `/payments/${orderId}/fail`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Payments', 'Notifications'],
    }),
    cancelSubscription: build.mutation<MySubscriptionDto, void>({
      query: () => ({ url: '/my-subscription/cancel', method: 'POST' }),
      invalidatesTags: [...AFTER_PLAN_CHANGE],
    }),
    myPayments: build.query<PaymentDto[], void>({
      query: () => ({ url: '/me/payments' }),
      providesTags: ['Payments'],
    }),
    usage: build.query<UsageDto, void>({
      query: () => ({ url: '/me/usage' }),
      providesTags: ['MySubscription'],
    }),
  }),
});

export const {
  usePlansQuery,
  useMySubscriptionQuery,
  useLazyPreviewQuery,
  usePreviewQuery,
  useSubscribeMutation,
  useVerifyPaymentMutation,
  usePaymentFailedMutation,
  useCancelSubscriptionMutation,
  useMyPaymentsQuery,
} = subscriptionApi;
