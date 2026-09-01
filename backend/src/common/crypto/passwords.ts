import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing.
 *
 * Separate from `tokens.ts` on purpose. That file hashes a six-digit sign-in
 * code that lives ten minutes; this one hashes a secret a person chose, may
 * reuse elsewhere, and expects to keep for years. The threat model is different
 * and so are the parameters.
 *
 * scrypt, from Node's own crypto, rather than argon2 or bcrypt from npm. It is
 * memory-hard, it is what the platform ships, and adding a native dependency to
 * a deployment target we do not yet control is a cost with no security benefit
 * here. If a future review prefers argon2id, only this file changes: the stored
 * format carries its own parameters.
 */

/**
 * N=2^15 with r=8 needs about 32MB per hash, four times the cost of the OTP
 * parameters. `maxmem` is stated explicitly because Node defaults it to 32MB
 * and throws "memory limit exceeded" the moment the parameters reach it, which
 * would turn every sign-in into a 500. That failure has already happened once
 * on this project with a smaller N, so the limit is set deliberately rather
 * than left to a default.
 */
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 128 * 1024 * 1024;

const SCRYPT_OPTIONS: ScryptOptions = {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELISM,
  maxmem: SCRYPT_MAX_MEMORY,
};

/** Below this a password is trivially guessable whatever the hash costs. */
export const MIN_PASSWORD_LENGTH = 8;
/** Above this the hashing cost becomes a denial-of-service vector. */
export const MAX_PASSWORD_LENGTH = 200;

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Hashes a password with a fresh salt.
 *
 * Returns `scrypt$N$r$p$salt$hash`. The parameters travel with the value, so
 * raising the cost later does not invalidate every existing password: an old
 * hash still verifies against the parameters it was created with.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt,
    derived.toString('hex'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false for anything malformed rather than throwing, so a corrupt row
 * denies access instead of returning a 500 that tells an attacker the row is
 * interesting.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // No password set. This account signs in another way, and no password can
    // ever match it.
    return false;
  }

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, cost, blockSize, parallelism, salt, expectedHex] = parts;
  const options: ScryptOptions = {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism),
    maxmem: SCRYPT_MAX_MEMORY,
  };

  if (!Number.isInteger(options.N) || !Number.isInteger(options.r) || !Number.isInteger(options.p)) {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await scryptAsync(password, salt, expectedHex.length / 2, options);
  } catch {
    // Parameters the current runtime refuses, for instance a cost raised beyond
    // maxmem. Fail closed.
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== derived.length) {
    return false;
  }

  // Constant time, so the comparison does not leak how much of a guess matched.
  return timingSafeEqual(derived, expected);
}

/** True when a hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string | null): boolean {
  if (!stored) {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return true;
  }
  return Number(parts[1]) < SCRYPT_COST;
}

export interface PasswordProblem {
  readonly code: 'TOO_SHORT' | 'TOO_LONG' | 'TOO_COMMON';
  readonly message: { he: string; en: string };
}

/**
 * The smallest rule set worth having.
 *
 * Deliberately not a composition rule about symbols and capitals. Those push
 * people toward "Password1!" and are worse than length. Length plus a short
 * denylist of the passwords that actually appear in breach lists catches more
 * real weakness with less friction, which matters for an audience that is
 * mostly on a phone.
 */
const COMMON = new Set([
  'password', '12345678', '123456789', '1234567890', 'qwerty123', 'password1',
  'iloveyou', 'abc12345', '11111111', '123123123', 'football', 'princess',
  // Both brand names: the shop's own name is the first thing a customer
  // tries, and the old one stays banned for anyone who already used it.
  'easycoins', 'zuzcoins', 'qwertyuiop', 'admin123',
]);

export function checkPasswordStrength(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      code: 'TOO_SHORT',
      message: {
        he: `הסיסמה צריכה להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות.`,
        en: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      code: 'TOO_LONG',
      message: {
        he: `הסיסמה ארוכה מדי. עד ${MAX_PASSWORD_LENGTH} תווים.`,
        en: `That password is too long. Up to ${MAX_PASSWORD_LENGTH} characters.`,
      },
    };
  }

  if (COMMON.has(password.toLowerCase())) {
    return {
      code: 'TOO_COMMON',
      message: {
        he: 'הסיסמה הזו נפוצה מדי. בחרו משהו אחר.',
        en: 'That password is too common. Please choose another.',
      },
    };
  }

  return null;
}
