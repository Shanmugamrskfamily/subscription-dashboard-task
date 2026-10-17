// The app stack the end-to-end tests and the README media capture run against: the API
// on 5100 (in-memory MongoDB, simulated payments) and the Vite client on 5174, so a
// developer's own servers on 5000/5173 are never touched.
//
// Everything is passed explicitly, so the run needs no .env files and never reads one.
/* global process */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const API_PORT = 5100;
export const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const HEALTH_URL = `${API_URL}/api/health`;

/**
 * A fresh ECDH P-256 key pair (same formats as scripts/gen-keys.mjs: PKCS#8 private key,
 * raw uncompressed public key, both base64) and a JWT secret, made once per run. They are
 * kept in process.env so Playwright's worker processes see the same values.
 */
function ephemeralSecrets() {
  if (!process.env.E2E_PAYLOAD_PUBLIC_KEY) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    // A P-256 SPKI ends with the 65-byte uncompressed point (0x04 || X || Y).
    process.env.E2E_PAYLOAD_PUBLIC_KEY = publicKey.subarray(-65).toString('base64');
    process.env.E2E_PAYLOAD_PRIVATE_KEY = privateKey.toString('base64');
    process.env.E2E_JWT_SECRET = randomBytes(48).toString('base64url');
  }
  return {
    publicKey: process.env.E2E_PAYLOAD_PUBLIC_KEY,
    privateKey: process.env.E2E_PAYLOAD_PRIVATE_KEY,
    jwtSecret: process.env.E2E_JWT_SECRET,
  };
}

const KID = 'e2e';

export function apiEnv() {
  const s = ephemeralSecrets();
  return {
    // "test" skips server/.env entirely and turns off the rate limits, which a suite that
    // signs in dozens of times from one address would otherwise trip.
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    // Empty: an in-memory MongoDB replica set that disappears with the process.
    MONGODB_URI: '',
    DNS_SERVERS: '',
    JWT_ACCESS_SECRET: s.jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_DAYS: '7',
    BCRYPT_ROUNDS: '4',
    PAYLOAD_PRIVATE_KEY: s.privateKey,
    PAYLOAD_PUBLIC_KEY: s.publicKey,
    PAYLOAD_KID: KID,
    // The browser always encrypts; plain requests stay allowed for test setup calls.
    ENCRYPTION_REQUIRED: 'false',
    PAYMENTS_MODE: 'simulated',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    CLIENT_ORIGINS: WEB_URL,
    TRUST_PROXY: '0',
    SEED_ON_BOOT: 'true',
    DEMO_MODE: 'true',
    SUPPORT_EMAIL: 'support@planpilot.demo',
  };
}

export function webEnv() {
  const s = ephemeralSecrets();
  return {
    NODE_ENV: 'development',
    // Real environment variables win over client/.env.local in Vite.
    VITE_PAYLOAD_PUBLIC_KEY: s.publicKey,
    VITE_PAYLOAD_KID: KID,
    VITE_SITE_URL: WEB_URL,
    API_PROXY_TARGET: API_URL,
  };
}

/** Node arguments that start each half of the stack, and the folder each runs in. */
export const API_ARGS = ['--import', 'tsx', 'server/src/server.ts'];
export const API_CWD = ROOT;
export const WEB_ARGS = [
  '../node_modules/vite/bin/vite.js',
  '--port',
  String(WEB_PORT),
  '--strictPort',
];
export const WEB_CWD = resolve(ROOT, 'client');
