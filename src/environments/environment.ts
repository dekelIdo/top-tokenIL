import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/** Default (production-shaped) configuration. Replaced per build configuration. */
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
