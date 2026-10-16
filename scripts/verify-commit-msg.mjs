// Enforces Conventional Commits: "type(scope): subject", e.g. "feat(auth): add refresh token rotation".
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const message = readFileSync(file, 'utf8').split('\n')[0].trim();

const TYPES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'revert',
];
const pattern = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: .{3,100}$`);

if (message.startsWith('Merge ') || pattern.test(message)) process.exit(0);

console.error(`\nInvalid commit message: "${message}"`);
console.error(`Use "type(scope): subject" with type one of: ${TYPES.join(', ')}`);
console.error('Example: feat(auth): add refresh token rotation\n');
process.exit(1);
