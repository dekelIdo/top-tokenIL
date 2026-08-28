import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/**
 * `mockApiEnabled` stays true until a real backend exists. Flipping it to false
 * before the HTTP implementations are written fails fast at startup rather than
 * silently serving an empty store.
 */
export const environment: AppEnvironment = {
  name: 'production',
  production: true,
  apiBaseUrl: '/api',
  mockApiEnabled: true,
  paymentsEnabled: true,
  analyticsEnabled: false,
  supportEnabled: true,
  defaultLocale: 'he',
  defaultRegion: RegionCode.Israel,
  debugLogging: false,
};
