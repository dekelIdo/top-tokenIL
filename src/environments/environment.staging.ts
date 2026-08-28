import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/**
 * Staging is the first configuration that talks to a real backend. It exists so
 * the HTTP data layer is exercised against a live API before production, with
 * analytics off so test traffic never pollutes real metrics.
 */
export const environment: AppEnvironment = {
  name: 'staging',
  production: true,
  apiBaseUrl: 'https://staging-api.toptoken.example/api',
  apiVersion: 'v1',
  apiMode: 'http',
  requestTimeoutMs: 15_000,
  paymentsEnabled: true,
  analyticsEnabled: false,
  supportEnabled: true,
  defaultLocale: 'he',
  defaultRegion: RegionCode.Israel,
  debugLogging: false,
};
