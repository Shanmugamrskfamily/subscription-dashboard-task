import { createClientSession } from '@planpilot/shared/crypto';
import type { ClientSession } from '@planpilot/shared/crypto';

const PUBLIC_KEY = import.meta.env.VITE_PAYLOAD_PUBLIC_KEY ?? '';
const KID = import.meta.env.VITE_PAYLOAD_KID ?? 'k1';

/** Encryption needs the server's public key and Web Crypto (always present over HTTPS). */
export const encryptionEnabled =
  Boolean(PUBLIC_KEY) && typeof globalThis.crypto?.subtle !== 'undefined';

let session: Promise<ClientSession> | null = null;

/**
 * One ECDH session per tab, created on the first request. The private half is a
 * non-extractable CryptoKey: it lives in memory and can't be read out by script.
 */
export function getCryptoSession(): Promise<ClientSession> {
  session ??= createClientSession(PUBLIC_KEY, KID).catch((error: unknown) => {
    session = null;
    throw error;
  });
  return session;
}
