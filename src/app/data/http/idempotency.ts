/**
 * Idempotency keys.
 *
 * Any request that can create money or an order carries one. The backend stores
 * the key with the result, so a retry — a flaky network, a double-click, a user
 * refreshing mid-payment — returns the original outcome instead of charging or
 * ordering twice.
 *
 * The key must be **stable for one logical attempt and different for the next**.
 * A key derived from the resource being acted on (checkout session, payment
 * intent) achieves that without any storage: retrying the same submit reuses the
 * key, while a deliberate retry after a decline uses a new intent and therefore
 * a new key.
 */

/** RFC 4122 v4 where available, falling back to a random-enough string. */
export function newIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Last resort. Only reachable in an environment without WebCrypto, which no
  // supported browser is; kept so the app degrades rather than throws.
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A deterministic key for an operation on a specific resource.
 *
 * Two submits of the same checkout session produce the same key, so the backend
 * de-duplicates them. Prefer this over a random key wherever a natural resource
 * id exists.
 */
export function scopedIdempotencyKey(operation: string, resourceId: string, attempt = 0): string {
  return `${operation}:${resourceId}${attempt > 0 ? `:${attempt}` : ''}`;
}
