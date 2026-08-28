import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  name: 'development',
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  mockApiEnabled: true,
  paymentsEnabled: true,
  analyticsEnabled: false,
  supportEnabled: true,
  defaultLocale: 'he',
  defaultRegion: RegionCode.Israel,
  debugLogging: true,
};
