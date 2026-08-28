import { LocaleCode, RegionCode } from '../app/domain';

/**
 * Build-time configuration.
 *
 * SECURITY: this file ships to the browser. It may contain public endpoints,
 * feature flags and publishable keys only. No API secret, no payment provider
 * secret key and no credential of any kind may ever be added here.
 */
export interface AppEnvironment {
  readonly name: 'development' | 'production';
  readonly production: boolean;
  readonly apiBaseUrl: string;
  /** When true the app is served by the in-memory mock backend. */
  readonly mockApiEnabled: boolean;
  /** When false, checkout stops before payment instead of simulating one. */
  readonly paymentsEnabled: boolean;
  readonly analyticsEnabled: boolean;
  readonly supportEnabled: boolean;
  readonly defaultLocale: LocaleCode;
  readonly defaultRegion: RegionCode;
  /** Console diagnostics. Off in production so no order data is ever logged. */
  readonly debugLogging: boolean;
}
