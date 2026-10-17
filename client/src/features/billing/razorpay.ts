import type { CheckoutOrder } from '@planpilot/shared';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(
    event: 'payment.failed',
    handler: (response: { error?: { description?: string } }) => void,
  ): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

/** Loads Razorpay Checkout only when someone actually pays (allowed by the CSP). */
function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export type RazorpayOutcome =
  | { kind: 'paid'; response: RazorpaySuccess }
  | { kind: 'dismissed' }
  | { kind: 'failed'; reason: string };

/** Opens Razorpay Checkout (test mode) and resolves with what the customer did. */
export async function openRazorpay(order: CheckoutOrder): Promise<RazorpayOutcome> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay Checkout is unavailable.');

  return new Promise<RazorpayOutcome>((resolve) => {
    let failure: string | null = null;
    const instance = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'PlanPilot',
      description: order.description,
      // Shown at the top of Checkout; Razorpay loads it from our public URL.
      image: new URL('/icon-512.png', window.location.origin).href,
      prefill: order.prefill,
      theme: { color: '#4F46E5' },
      handler: (response: RazorpaySuccess) => resolve({ kind: 'paid', response }),
      modal: {
        // Razorpay keeps the modal open after a failed attempt so the user can retry;
        // closing it after a failure reports that failure.
        ondismiss: () =>
          resolve(failure ? { kind: 'failed', reason: failure } : { kind: 'dismissed' }),
      },
    });
    instance.on('payment.failed', (response) => {
      failure = response.error?.description ?? 'The payment was declined.';
    });
    instance.open();
  });
}
