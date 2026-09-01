import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { badRequestError, serviceUnavailableError, unauthorizedError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';

/** Google's discovery endpoints, fixed rather than fetched at runtime. */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleProfile {
  /** Google's immutable id for the account. Never the email. */
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string;
}

/**
 * Google sign-in.
 *
 * **No credentials are shipped or invented.** The integration reads a client id
 * and secret from the environment, and when they are absent the provider simply
 * reports itself unconfigured: `isConfigured` is false, the storefront does not
 * offer the button, and the endpoints answer 503 rather than half-working. That
 * is the difference between infrastructure that is ready and a fake integration
 * that looks ready.
 *
 * What this class does and does not trust:
 *
 * - The `state` parameter is signed by us and checked on the way back, which is
 *   what prevents an attacker starting a flow and landing the result in someone
 *   else's session.
 * - The authorization code is exchanged server to server, so the browser never
 *   holds anything that could mint a session.
 * - The returned id token is verified against Google's published keys before a
 *   single claim inside it is believed. An unverified JWT is a string an
 *   attacker can write.
 * - An unverified email is refused. Google says whether it verified the address,
 *   and accepting one it has not is how account takeover by email collision
 *   happens.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** False until real credentials exist. Nothing pretends otherwise. */
  get isConfigured(): boolean {
    return Boolean(this.config.googleClientId && this.config.googleClientSecret);
  }

  private requireConfigured(): void {
    if (!this.isConfigured) {
      throw serviceUnavailableError(
        'Google sign-in is not configured on this environment',
        60,
        'GOOGLE_OAUTH_NOT_CONFIGURED',
      );
    }
  }

  /**
   * Builds the URL to send the customer to, plus the state to store.
   *
   * The state is random, and only its hash is kept in the cookie, so a stolen
   * cookie cannot be replayed against a different flow.
   */
  buildAuthorizationUrl(returnPath: string): { url: string; state: string } {
    this.requireConfigured();

    const nonce = randomBytes(24).toString('base64url');
    // The return path travels inside the state so an attacker cannot swap it
    // for an external URL on the callback.
    const state = `${nonce}.${Buffer.from(this.safeReturnPath(returnPath)).toString('base64url')}`;

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', this.config.googleClientId!);
    url.searchParams.set('redirect_uri', this.config.googleRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    // Only ever an identity request. No offline access, no refresh token, and
    // nothing that would let us act on the customer's Google account later.
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');

    return { url: url.toString(), state };
  }

  /** What we store in the customer's cookie while they are away at Google. */
  hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  /** Constant-time comparison of the returned state against the stored hash. */
  stateMatches(returned: string, storedHash: string | undefined): boolean {
    if (!storedHash) {
      return false;
    }
    const expected = Buffer.from(storedHash, 'utf8');
    const actual = Buffer.from(this.hashState(returned), 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /** The path to send the customer back to, constrained to this site. */
  returnPathFrom(state: string): string {
    const encoded = state.split('.')[1];
    if (!encoded) {
      return '/account';
    }
    try {
      return this.safeReturnPath(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      return '/account';
    }
  }

  /**
   * Only same-site paths. An open redirect here would let a phishing page send
   * a customer through our domain and out to theirs, wearing our name.
   */
  private safeReturnPath(path: string): string {
    if (!path.startsWith('/') || path.startsWith('//')) {
      return '/account';
    }
    return path;
  }

  /**
   * Exchanges the authorization code and returns the verified profile.
   *
   * Every failure here is deliberately opaque to the caller: a customer sees
   * "sign-in failed", and the detail goes to the log.
   */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    this.requireConfigured();

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.googleClientId!,
        client_secret: this.config.googleClientSecret!,
        redirect_uri: this.config.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      // The body can contain the client secret in an echoed request; never log it.
      this.logger.warn('google token exchange failed', { status: response.status });
      throw unauthorizedError('Google sign-in failed', 'GOOGLE_EXCHANGE_FAILED');
    }

    const payload = (await response.json()) as { id_token?: string };
    if (!payload.id_token) {
      throw unauthorizedError('Google returned no identity token', 'GOOGLE_EXCHANGE_FAILED');
    }

    return this.verifyIdToken(payload.id_token);
  }

  /**
   * Verifies an id token against Google's published signing keys.
   *
   * Verification uses `crypto.subtle`, which is in Node without a dependency.
   * The checks are the standard set and all of them matter: signature, issuer,
   * audience, and expiry. Skipping any one of them makes the others pointless.
   */
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    const [headerPart, payloadPart, signaturePart] = idToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      throw unauthorizedError('Malformed identity token', 'GOOGLE_TOKEN_INVALID');
    }

    const header = this.decodeSegment(headerPart) as { kid?: string; alg?: string };
    const claims = this.decodeSegment(payloadPart) as Record<string, unknown>;

    if (header.alg !== 'RS256') {
      throw unauthorizedError('Unexpected token algorithm', 'GOOGLE_TOKEN_INVALID');
    }

    const key = await this.signingKey(header.kid);
    const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, 'base64url');

    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      data,
    );

    if (!valid) {
      throw unauthorizedError('Identity token signature did not verify', 'GOOGLE_TOKEN_INVALID');
    }

    if (!GOOGLE_ISSUERS.includes(String(claims['iss']))) {
      throw unauthorizedError('Unexpected token issuer', 'GOOGLE_TOKEN_INVALID');
    }

    if (claims['aud'] !== this.config.googleClientId) {
      // A token minted for another application is not a sign-in here.
      throw unauthorizedError('Token was issued for another application', 'GOOGLE_TOKEN_INVALID');
    }

    const expiry = Number(claims['exp']) * 1000;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      throw unauthorizedError('Identity token has expired', 'GOOGLE_TOKEN_INVALID');
    }

    const email = claims['email'];
    if (typeof email !== 'string' || claims['email_verified'] !== true) {
      // Google tells us whether it verified the address. Trusting an unverified
      // one would let somebody claim an account by asserting its email.
      throw unauthorizedError('Google has not verified this address', 'GOOGLE_EMAIL_UNVERIFIED');
    }

    return {
      subject: String(claims['sub']),
      email: email.trim().toLowerCase(),
      emailVerified: true,
      name: typeof claims['name'] === 'string' ? claims['name'] : undefined,
    };
  }

  private decodeSegment(segment: string): unknown {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    } catch {
      throw unauthorizedError('Malformed identity token', 'GOOGLE_TOKEN_INVALID');
    }
  }

  /**
   * Fetches Google's current signing keys.
   *
   * Cached for an hour: Google rotates these, so pinning one forever breaks
   * sign-in, and fetching per request adds a round trip to every login.
   */
  private keyCache: { fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

  private async signingKey(kid: string | undefined): Promise<CryptoKey> {
    if (!kid) {
      throw unauthorizedError('Identity token names no key', 'GOOGLE_TOKEN_INVALID');
    }

    const fresh = this.keyCache && Date.now() - this.keyCache.fetchedAt < 60 * 60 * 1000;
    if (!fresh) {
      this.keyCache = { fetchedAt: Date.now(), keys: await this.fetchKeys() };
    }

    const key = this.keyCache!.keys.get(kid);
    if (!key) {
      // A key we have not seen, most likely a rotation. Refetch once before
      // refusing, otherwise every rotation locks customers out until a restart.
      this.keyCache = { fetchedAt: Date.now(), keys: await this.fetchKeys() };
      const retried = this.keyCache.keys.get(kid);
      if (retried) {
        return retried;
      }
      throw unauthorizedError('Unknown signing key', 'GOOGLE_TOKEN_INVALID');
    }

    return key;
  }

  private async fetchKeys(): Promise<Map<string, CryptoKey>> {
    const response = await fetch(GOOGLE_JWKS_URL);
    if (!response.ok) {
      throw serviceUnavailableError(
        'Could not reach Google to verify sign-in',
        30,
        'GOOGLE_JWKS_UNAVAILABLE',
      );
    }

    const body = (await response.json()) as { keys?: JsonWebKey[] };
    const keys = new Map<string, CryptoKey>();

    for (const jwk of body.keys ?? []) {
      const kid = (jwk as { kid?: string }).kid;
      if (!kid) {
        continue;
      }
      keys.set(
        kid,
        await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      );
    }

    if (keys.size === 0) {
      throw badRequestError('Google published no usable keys', 'GOOGLE_JWKS_EMPTY');
    }

    return keys;
  }
}
