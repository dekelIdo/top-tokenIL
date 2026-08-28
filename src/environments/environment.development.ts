import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/**
 * Local development runs against the in-memory mock backend, so the app is
 * fully usable with no server running. Point `apiMode` at 'http' and
 * `apiBaseUrl` at a local backend to develop against the real API instead.
 */
export const environment: AppEnvironment = {
  name: 'development',
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
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
