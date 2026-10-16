import { randomBytes } from 'node:crypto';
import { boolean, number, object, string, ValidationError } from 'yup';

/** Every configuration problem at once, so a bad deploy shows the full list. */
export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

const blankToUndefined = (value: unknown, original: unknown) =>
  original === '' || original === undefined ? undefined : value;

const num = (fallback: number, min: number, max: number) =>
  number().transform(blankToUndefined).integer().min(min).max(max).default(fallback);
const flag = () => boolean().transform(blankToUndefined).optional();
const text = (fallback = '') => string().trim().default(fallback);

const schema = object({
  NODE_ENV: string().oneOf(['development', 'test', 'production']).default('development'),
  PORT: num(5000, 1, 65535),
  LOG_LEVEL: string()
    .oneOf(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  MONGODB_URI: text(),
  /** Comma-separated DNS resolvers for mongodb+srv lookups on machines whose DNS refuses SRV. */
  DNS_SERVERS: text(),

  JWT_ACCESS_SECRET: text(),
  ACCESS_TOKEN_TTL_SECONDS: num(900, 60, 3600),
  REFRESH_TOKEN_TTL_DAYS: num(7, 1, 60),
  BCRYPT_ROUNDS: num(12, 4, 15),

  PAYLOAD_PRIVATE_KEY: text(),
  PAYLOAD_PUBLIC_KEY: text(),
  PAYLOAD_KID: string()
    .trim()
    .matches(/^[a-z0-9-]{1,16}$/, 'PAYLOAD_KID must be lowercase letters, digits or hyphens')
    .default('k1'),
  ENCRYPTION_REQUIRED: flag(),

  PAYMENTS_MODE: string().transform(blankToUndefined).oneOf(['razorpay', 'simulated']).optional(),
  RAZORPAY_KEY_ID: text(),
  RAZORPAY_KEY_SECRET: text(),

  CLIENT_ORIGINS: text('http://localhost:5173'),
  TRUST_PROXY: num(0, 0, 5),
  SEED_ON_BOOT: flag(),
  DEMO_MODE: flag(),
  SUPPORT_EMAIL: string().trim().email().default('support@planpilot.demo'),
});

export type AppConfig = ReturnType<typeof buildConfig>;

function buildConfig(raw: Record<string, string | undefined>) {
  let v: ReturnType<typeof schema.validateSync>;
  try {
    v = schema.validateSync(raw, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    if (error instanceof ValidationError) throw new ConfigError(error.errors);
    throw error;
  }
  const isProd = v.NODE_ENV === 'production';
  const isTest = v.NODE_ENV === 'test';
  const hasRazorpayKeys = Boolean(v.RAZORPAY_KEY_ID && v.RAZORPAY_KEY_SECRET);
  const paymentsMode = (v.PAYMENTS_MODE ?? (hasRazorpayKeys ? 'razorpay' : 'simulated')) as
    'razorpay' | 'simulated';

  const problems: string[] = [];
  if (isProd) {
    if (!v.MONGODB_URI) problems.push('MONGODB_URI is required in production');
    if (v.JWT_ACCESS_SECRET.length < 32)
      problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
    if (!v.PAYLOAD_PRIVATE_KEY || !v.PAYLOAD_PUBLIC_KEY) {
      problems.push(
        'PAYLOAD_PRIVATE_KEY and PAYLOAD_PUBLIC_KEY are required (run npm run gen:keys)',
      );
    }
  }
  if (paymentsMode === 'razorpay' && !hasRazorpayKeys) {
    problems.push(
      'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENTS_MODE=razorpay',
    );
  }
  if (v.RAZORPAY_KEY_ID && isProd && !v.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
    problems.push('Only Razorpay TEST keys (rzp_test_...) are allowed in this project');
  }
  if (problems.length) throw new ConfigError(problems);

  return {
    nodeEnv: v.NODE_ENV as 'development' | 'test' | 'production',
    isProd,
    isTest,
    port: v.PORT,
    logLevel: isTest ? 'silent' : v.LOG_LEVEL,
    mongoUri: v.MONGODB_URI,
    dnsServers: v.DNS_SERVERS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // A random per-boot secret keeps local development zero-config; production must set one.
    jwtSecret: v.JWT_ACCESS_SECRET || randomBytes(48).toString('hex'),
    accessTokenTtlSeconds: v.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: v.REFRESH_TOKEN_TTL_DAYS,
    bcryptRounds: v.BCRYPT_ROUNDS,
    payload: {
      privateKey: v.PAYLOAD_PRIVATE_KEY,
      publicKey: v.PAYLOAD_PUBLIC_KEY,
      kid: v.PAYLOAD_KID,
      enabled: Boolean(v.PAYLOAD_PRIVATE_KEY && v.PAYLOAD_PUBLIC_KEY),
      required: v.ENCRYPTION_REQUIRED ?? isProd,
    },
    payments: {
      mode: paymentsMode,
      keyId: v.RAZORPAY_KEY_ID,
      keySecret: v.RAZORPAY_KEY_SECRET,
    },
    clientOrigins: v.CLIENT_ORIGINS.split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: v.TRUST_PROXY,
    seedOnBoot: v.SEED_ON_BOOT ?? false,
    demoMode: v.DEMO_MODE ?? false,
    supportEmail: v.SUPPORT_EMAIL,
    cookie: {
      // __Host- cookies must be Secure, so the prefix is only used over HTTPS.
      name: isProd ? '__Host-pp_rt' : 'pp_rt',
      secure: isProd,
    },
  };
}

let cached: AppConfig | undefined;

/** Validated configuration. Throws a ConfigError listing every problem at once. */
export function getConfig(): AppConfig {
  cached ??= buildConfig(process.env);
  return cached;
}

/** Tests build configs from explicit values instead of process.env. */
export function loadConfig(raw: Record<string, string | undefined>): AppConfig {
  return buildConfig(raw);
}

/** Lets tests change process.env and pick the new values up. */
export function resetConfigCache(): void {
  cached = undefined;
}
