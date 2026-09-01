import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

/**
 * `promisify(scrypt)` resolves to the three-argument overload, which loses the
 * options parameter, so the cost factor could not be set. Wrapping it by hand
 * keeps the parameters explicit.
 */
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
 * Token and code handling.
 *
 * Two different problems that need two different hashes:
 *
 * - A session token is 256 bits of randomness. It cannot be guessed or brute
 *   forced, so a fast hash (SHA-256) is the right choice: it protects a leaked
 *   database without slowing every authenticated request.
 * - A sign-in code is six digits, a million possibilities. A fast hash would let
 *   anyone who reads the table enumerate it instantly, so it gets scrypt.
 *
 * Using scrypt for sessions would be wasted work on every request; using SHA-256
 * for codes would be negligent. The distinction is deliberate.
 */

/** Bytes of entropy in a session token. 32 bytes = 256 bits. */
const SESSION_TOKEN_BYTES = 32;

/**
 * scrypt parameters.
 *
 * Memory used is 128 * N * r bytes, so N=2^14 with r=8 needs about 16MB.
 * `maxmem` is stated explicitly because Node defaults it to 32MB and silently
 * throws "memory limit exceeded" once the parameters cross it, which turns
 * every sign-in into a 500. Setting it here means raising N later fails loudly
 * at the wrong value rather than at runtime.
 *
 * N=2^14 is deliberate for a six-digit code that lives ten minutes and allows
 * five attempts. Enumerating all million candidates against one stolen hash
 * costs hours of CPU, by which time the code has long expired. A password would
 * warrant more; this is not a password.
 */
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

const SCRYPT_OPTIONS: ScryptOptions = {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: 1,
  maxmem: SCRYPT_MAX_MEMORY,
};

/**
 * A new session token.
 *
 * base64url so it survives a cookie value without escaping, and is opaque to
 * anyone reading it: it encodes nothing about the session or the customer.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * What we store for a session token.
 *
 * The plaintext lives only in the customer's cookie. A database leak therefore
 * yields hashes, not live sessions.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A six-digit sign-in code, uniformly distributed. */
export function generateOtpCode(): string {
  // randomInt is rejection-sampled, so every code is equally likely. Math.random
  // would be both biased and predictable.
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Hashes a sign-in code with a fresh salt.
 *
 * Returns `scrypt$<salt>$<hash>`, so the parameters travel with the value and a
 * future cost increase does not invalidate existing codes.
 */
export async function hashOtpCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(code, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

/**
 * Verifies a code in constant time with respect to the stored hash.
 *
 * A plain `===` would leak, through timing, how many leading characters were
 * correct. With six digits that is enough to matter.
 */
export async function verifyOtpCode(code: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) {
    return false;
  }

  const derived = await scryptAsync(code, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);

  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(derived, expectedBuffer);
}

/**
 * Identifiers for rows a customer can address.
 *
 * Order and session ids are capabilities: someone who holds one can ask about
 * it. Sequential ids would let anyone walk the table, so these carry 128 bits of
 * randomness behind a readable prefix.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

/**
 * A human-facing order reference.
 *
 * Deliberately NOT the order id. It appears in emails and support conversations,
 * so it is short and readable, and it grants no access on its own.
 */
export function generateOrderNumber(sequence: number): string {
  return `EC-${sequence.toString().padStart(6, '0')}`;
}
