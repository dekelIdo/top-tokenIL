import { LocaleCode, RegionCode } from '../app/domain';

/**
 * Which implementation the API abstractions are bound to.
 *
 * `mock` runs the in-memory backend and is the default for local development.
 * `http` talks to a real backend over the versioned REST contract in
 * docs/API-CONTRACT.md. The switch is configuration only — no UI, facade or
 * domain code is aware of which one is active.
 */
export type ApiMode = 'mock' | 'http';

/**
 * Build-time configuration.
 *
 * SECURITY: this file ships to the browser. It may contain public endpoints,
 * feature flags and publishable keys only. No API secret, no payment provider
 * secret key, no webhook secret and no credential of any kind may ever be added
 * here. Anything secret belongs to the backend.
 */
export interface AppEnvironment {
  readonly name: 'development' | 'staging' | 'production';
  readonly production: boolean;

  /** Origin + path prefix, without the version segment. */
  readonly apiBaseUrl: string;
  /** API major version. Every request goes to `{apiBaseUrl}/{apiVersion}/...`. */
  readonly apiVersion: 'v1';
  readonly apiMode: ApiMode;
  /** Abort a request that has not responded in this long. */
  readonly requestTimeoutMs: number;

  /** When false, checkout stops before payment instead of starting one. */
  readonly paymentsEnabled: boolean;
  readonly analyticsEnabled: boolean;
  readonly supportEnabled: boolean;

  readonly defaultLocale: LocaleCode;
  readonly defaultRegion: RegionCode;

  /** Console diagnostics. Off in production so no order data is ever logged. */
  readonly debugLogging: boolean;
}
