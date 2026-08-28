import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/** Default configuration. Replaced per build configuration by angular.json. */
export const environment: AppEnvironment = {
  name: 'development',
  production: false,
  apiBaseUrl: '/api',
  apiVersion: 'v1',
  apiMode: 'mock',
  requestTimeoutMs: 15_000,
  paymentsEnabled: true,
  analyticsEnabled: false,
  supportEnabled: true,
  defaultLocale: 'he',
  defaultRegion: RegionCode.Israel,
  debugLogging: true,
};
