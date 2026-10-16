import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads server/.env in development only. Production values come from the host
 * (Render), and tests set their own variables so a local .env can never leak in.
 */
export function loadEnvFile(): void {
  const mode = process.env.NODE_ENV ?? 'development';
  if (mode === 'test' || mode === 'production') return;
  const file = resolve(process.cwd(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
