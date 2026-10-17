/**
 * Encrypted request/response envelope.
 *
 * Key agreement: the browser makes an ephemeral ECDH P-256 key pair per tab and
 * combines it with the server's static public key. HKDF-SHA-256 turns the shared
 * secret into an AES-256-GCM key. Only the server's PUBLIC key ships in the bundle,
 * so there is no shared secret for anyone to lift out of DevTools.
 *
 * Every message gets a fresh random 96-bit IV, and GCM's 128-bit tag rejects any
 * tampering. The additional authenticated data (AAD) binds a body to its exact
 * request (method, path, timestamp, nonce), and a response to its request's nonce
 * and status, so ciphertext can't be replayed or swapped onto another call.
 *
 * HTTPS remains the primary transport protection; this is defence in depth.
 */
import { concatBytes, fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from './encoding';

export const ENVELOPE_VERSION = 1;
export const IV_BYTES = 12;
export const NONCE_BYTES = 16;
export const TAG_BYTES = 16;
/** Requests whose timestamp is further than this from server time are rejected. */
export const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

export const ENC_HEADERS = {
  session: 'x-enc-session',
  kid: 'x-enc-kid',
  ts: 'x-enc-ts',
  nonce: 'x-enc-nonce',
  /** Set on responses whose body is an envelope. */
  response: 'x-enc',
} as const;

export interface Envelope {
  v: typeof ENVELOPE_VERSION;
  iv: string;
  ct: string;
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const HKDF_INFO = utf8('planpilot/envelope/v1');
const RAW_P256_PUBLIC_KEY_BYTES = 65;

const subtle = () => globalThis.crypto.subtle;

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === ENVELOPE_VERSION &&
    typeof v.iv === 'string' &&
    typeof v.ct === 'string' &&
    Object.keys(v).length === 3
  );
}

export const requestAad = (method: string, path: string, ts: string, nonce: string) =>
  `req|${method.toUpperCase()}|${path}|${ts}|${nonce}`;

export const responseAad = (nonce: string, status: number) => `res|${nonce}|${status}`;

export const newNonce = () => toBase64(randomBytes(NONCE_BYTES));

// ---------- keys ----------

/** Used once by `npm run gen:keys` to create the server's long-lived key pair. */
export async function generateServerKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const [pkcs8, raw] = await Promise.all([
    subtle().exportKey('pkcs8', pair.privateKey),
    subtle().exportKey('raw', pair.publicKey),
  ]);
  return { privateKey: toBase64(pkcs8), publicKey: toBase64(raw) };
}

export async function importServerPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return subtle().importKey('pkcs8', fromBase64(pkcs8Base64), ECDH, false, ['deriveBits']);
}

export async function importPublicKey(rawBase64: string): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(rawBase64);
  } catch {
    throw new EnvelopeError('Public key is not valid base64');
  }
  // An uncompressed P-256 point is 0x04 followed by 32-byte X and Y coordinates.
  if (bytes.length !== RAW_P256_PUBLIC_KEY_BYTES || bytes[0] !== 0x04) {
    throw new EnvelopeError('Public key is not an uncompressed P-256 point');
  }
  try {
    return await subtle().importKey('raw', bytes, ECDH, true, []);
  } catch {
    throw new EnvelopeError('Public key is not on the P-256 curve');
  }
}

/**
 * ECDH → HKDF-SHA-256 → AES-256-GCM. The HKDF salt is a hash of both public keys,
 * so the derived key is bound to this exact pair of parties.
 */
async function deriveAesKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  clientPublicRaw: Uint8Array,
  serverPublicRaw: Uint8Array,
): Promise<CryptoKey> {
  const secret = await subtle().deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );
  const hkdfKey = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const salt = await subtle().digest('SHA-256', concatBytes(clientPublicRaw, serverPublicRaw));
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface ClientSession {
  kid: string;
  /** Base64 raw public key, sent in the X-Enc-Session header. */
  publicKey: string;
  key: CryptoKey;
}

/** Browser side: one call per tab. The private key is created non-extractable. */
export async function createClientSession(
  serverPublicKey: string,
  kid: string,
): Promise<ClientSession> {
  const serverKey = await importPublicKey(serverPublicKey);
  const pair = await subtle().generateKey(ECDH, false, ['deriveBits']);
  const clientRaw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const key = await deriveAesKey(
    pair.privateKey,
    serverKey,
    clientRaw,
    fromBase64(serverPublicKey),
  );
  return { kid, publicKey: toBase64(clientRaw), key };
}

/** Server side: derives the same AES key from its private key and the client's public key. */
export async function deriveServerSessionKey(
  serverPrivateKey: CryptoKey,
  serverPublicKey: string,
  clientPublicKey: string,
): Promise<CryptoKey> {
  const clientKey = await importPublicKey(clientPublicKey);
  return deriveAesKey(
    serverPrivateKey,
    clientKey,
    fromBase64(clientPublicKey),
    fromBase64(serverPublicKey),
  );
}

// ---------- sealing ----------

export async function seal(key: CryptoKey, data: unknown, aad: string): Promise<Envelope> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = utf8(JSON.stringify(data ?? null));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: TAG_BYTES * 8 },
    key,
    plaintext,
  );
  return { v: ENVELOPE_VERSION, iv: toBase64(iv), ct: toBase64(ciphertext) };
}

export async function open<T = unknown>(
  key: CryptoKey,
  envelope: unknown,
  aad: string,
): Promise<T> {
  if (!isEnvelope(envelope)) throw new EnvelopeError('Body is not an envelope');
  let iv: Uint8Array<ArrayBuffer>;
  let ciphertext: Uint8Array<ArrayBuffer>;
  try {
    iv = fromBase64(envelope.iv);
    ciphertext = fromBase64(envelope.ct);
  } catch {
    throw new EnvelopeError('Envelope is not valid base64');
  }
  if (iv.length !== IV_BYTES || ciphertext.length < TAG_BYTES) {
    throw new EnvelopeError('Envelope has the wrong shape');
  }
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: TAG_BYTES * 8 },
      key,
      ciphertext,
    );
  } catch {
    // Wrong key, wrong AAD or a modified byte all look the same on purpose.
    throw new EnvelopeError('Envelope could not be decrypted');
  }
  try {
    return JSON.parse(fromUtf8(plaintext)) as T;
  } catch {
    throw new EnvelopeError('Envelope content is not JSON');
  }
}
