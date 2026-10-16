import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Role } from '@planpilot/shared';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../config/env';

const ISSUER = 'planpilot-api';
const AUDIENCE = 'planpilot-web';

export interface AccessClaims {
  sub: string;
  role: Role;
  sid: string;
}

export function signAccessToken(
  config: AppConfig,
  claims: AccessClaims,
): { token: string; expiresAt: Date } {
  const token = jwt.sign({ role: claims.role, sid: claims.sid }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: claims.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: config.accessTokenTtlSeconds,
    jwtid: randomUUID(),
  });
  return { token, expiresAt: new Date(Date.now() + config.accessTokenTtlSeconds * 1000) };
}

/** Pins the algorithm, issuer and audience, so `alg: none` and foreign tokens fail. */
export function verifyAccessToken(config: AppConfig, token: string): AccessClaims {
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as jwt.JwtPayload;
  return { sub: String(payload.sub), role: payload.role as Role, sid: String(payload.sid) };
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newFamilyId = () => randomUUID();
