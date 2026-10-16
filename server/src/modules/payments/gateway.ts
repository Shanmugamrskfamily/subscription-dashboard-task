import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ERROR_CODES } from '@planpilot/shared';
import type { AppConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { logger } from '../../utils/logger';

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: 'INR';
}

export interface PaymentGateway {
  mode: 'razorpay' | 'simulated';
  keyId: string;
  createOrder(order: {
    amount: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Simulated mode only: the success values the test checkout sends back. */
  simulateSuccess?(orderId: string): { paymentId: string; signature: string };
}

const alphanumeric = (length: number) =>
  randomBytes(length)
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, length)
    .padEnd(length, 'x');

/** Razorpay's documented check: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function signPayment(secret: string, orderId: string, paymentId: string): string {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function signatureMatches(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signPayment(secret, orderId, paymentId), 'hex');
  const given = Buffer.from(signature, 'hex');
  // Constant-time compare, so timing can't reveal how many characters matched.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function razorpayGateway(keyId: string, keySecret: string): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  return {
    mode: 'razorpay',
    keyId,
    async createOrder({ amount, receipt, notes }) {
      let response: Response;
      try {
        response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, currency: 'INR', receipt, notes }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        logger.error({ err: error }, 'Razorpay is unreachable');
        throw new ApiError(
          502,
          ERROR_CODES.GATEWAY_ERROR,
          'The payment service is not responding. Please try again.',
        );
      }
      if (!response.ok) {
        logger.error(
          { status: response.status, body: await response.text() },
          'Razorpay rejected the order',
        );
        throw new ApiError(
          502,
          ERROR_CODES.GATEWAY_ERROR,
          'The payment service could not start checkout.',
        );
      }
      const order = (await response.json()) as { id: string; amount: number };
      return { id: order.id, amount: order.amount, currency: 'INR' };
    },
    verifySignature: (orderId, paymentId, signature) =>
      signatureMatches(keySecret, orderId, paymentId, signature),
  };
}

/** Local development and automated tests: same contract, no external calls. */
function simulatedGateway(secret: string): PaymentGateway {
  return {
    mode: 'simulated',
    keyId: 'rzp_test_simulated',
    async createOrder({ amount }) {
      return { id: `order_${alphanumeric(14)}`, amount, currency: 'INR' };
    },
    verifySignature: (orderId, paymentId, signature) =>
      signatureMatches(secret, orderId, paymentId, signature),
    simulateSuccess(orderId) {
      const paymentId = `pay_${alphanumeric(14)}`;
      return { paymentId, signature: signPayment(secret, orderId, paymentId) };
    },
  };
}

let cached: PaymentGateway | undefined;

export function getGateway(config: AppConfig): PaymentGateway {
  if (!cached) {
    cached =
      config.payments.mode === 'razorpay'
        ? razorpayGateway(config.payments.keyId, config.payments.keySecret)
        : simulatedGateway(
            createHmac('sha256', config.jwtSecret).update('simulated-payments').digest('hex'),
          );
  }
  return cached;
}

/** Tests swap in their own gateway. */
export function setGateway(gateway: PaymentGateway | undefined): void {
  cached = gateway;
}
