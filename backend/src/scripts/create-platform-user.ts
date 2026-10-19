/**
 * Creates a PLATFORM staff user (the only way to get the first one: company sign-up can never
 * produce platform roles). Run it yourself in a terminal:
 *
 *   pnpm create:platform-user --email=you@example.com [--role=owner|admin|support]
 *
 * The password is typed at a hidden prompt: it is never a command-line argument (shell history,
 * process lists) and never printed. It must pass the same policy as every other password.
 */
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { createDatabase } from '../database/client.js';
import { isDuplicateEntry } from '../database/errors.js';
import { platformRoles, users } from '../database/schema/index.js';
import type { PlatformRole } from '../database/schema/index.js';
import { hashPassword } from '../modules/auth/password.js';
import { checkPasswordPolicy } from '../modules/auth/password-policy.js';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buffer = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(buffer);
          return;
        }
        if (char === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') buffer = buffer.slice(0, -1);
        else buffer += char;
      }
    };
    stdin.on('data', onData);
  });
}

const email = argument('email')?.trim().toLowerCase();
const role = (argument('role') ?? 'owner') as PlatformRole;

if (email === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
  fail('pass a valid --email=you@example.com');
}
if (!platformRoles.includes(role)) fail(`--role must be one of: ${platformRoles.join(', ')}`);
if (!process.stdin.isTTY) fail('run this in an interactive terminal (the password is typed hidden)');

const password = await promptHidden('Password: ');
const issues = checkPasswordPolicy(password, { email });
if (issues.length > 0) fail(`password rejected (${issues.join(', ')}). Use 12+ characters, not common.`);
if ((await promptHidden('Repeat password: ')) !== password) fail('passwords do not match');

const database = createDatabase(loadEnv().DATABASE_URL);
try {
  await database.db.insert(users).values({
    id: uuidv7(),
    email,
    passwordHash: await hashPassword(password),
    platformRole: role,
  });
  console.log(`Created platform ${role}: ${email}`);
} catch (error) {
  if (isDuplicateEntry(error)) fail('a user with this email already exists');
  throw error;
} finally {
  await database.close();
}
