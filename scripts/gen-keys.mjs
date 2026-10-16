// Creates the secrets PlanPilot needs and writes them straight into the
// git-ignored env files. Values are never printed.
//
//   npm run gen:keys            fill in anything missing
//   npm run gen:keys -- --rotate  new payload key pair (bumps the key id) and JWT secret
import { randomBytes, webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const serverEnv = resolve(root, 'server/.env');
const clientEnv = resolve(root, 'client/.env.local');
const rotate = process.argv.includes('--rotate');

function read(file) {
  const values = new Map();
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function write(file, values, original) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const seen = new Set();
  const out = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match && values.has(match[1])) {
      seen.add(match[1]);
      return `${match[1]}=${values.get(match[1])}`;
    }
    return line;
  });
  for (const [key, value] of values) if (!seen.has(key)) out.push(`${key}=${value}`);
  writeFileSync(file, `${out.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n')}\n`);
  const changed = [...values.keys()].filter((k) => original.get(k) !== values.get(k));
  return changed;
}

const server = read(serverEnv);
const client = read(clientEnv);
const updates = new Map();
const clientUpdates = new Map();

if (rotate || !server.get('JWT_ACCESS_SECRET')) {
  updates.set('JWT_ACCESS_SECRET', randomBytes(48).toString('base64url'));
}

if (rotate || !server.get('PAYLOAD_PRIVATE_KEY') || !server.get('PAYLOAD_PUBLIC_KEY')) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString(
    'base64',
  );
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString(
    'base64',
  );
  const previous = Number((server.get('PAYLOAD_KID') ?? 'k0').replace(/\D/g, '')) || 0;
  const kid = rotate ? `k${previous + 1}` : (server.get('PAYLOAD_KID') ?? 'k1');
  updates.set('PAYLOAD_PRIVATE_KEY', pkcs8);
  updates.set('PAYLOAD_PUBLIC_KEY', raw);
  updates.set('PAYLOAD_KID', kid);
  clientUpdates.set('VITE_PAYLOAD_PUBLIC_KEY', raw);
  clientUpdates.set('VITE_PAYLOAD_KID', kid);
} else if (client.get('VITE_PAYLOAD_PUBLIC_KEY') !== server.get('PAYLOAD_PUBLIC_KEY')) {
  // Keep the client in step with the server's existing key.
  clientUpdates.set('VITE_PAYLOAD_PUBLIC_KEY', server.get('PAYLOAD_PUBLIC_KEY'));
  clientUpdates.set('VITE_PAYLOAD_KID', server.get('PAYLOAD_KID') ?? 'k1');
}

const changedServer = updates.size ? write(serverEnv, updates, server) : [];
const changedClient = clientUpdates.size ? write(clientEnv, clientUpdates, client) : [];

if (!changedServer.length && !changedClient.length) {
  console.log('All keys are already present. Use --rotate to replace them.');
} else {
  if (changedServer.length) console.log(`server/.env        updated: ${changedServer.join(', ')}`);
  if (changedClient.length) console.log(`client/.env.local  updated: ${changedClient.join(', ')}`);
  console.log(
    '\nValues were written to the files only. Copy them into Render and Vercel yourself.',
  );
}
