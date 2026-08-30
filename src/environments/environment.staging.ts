import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/**
 * Staging is the first configuration that talks to a real backend, and the only
 * one that does today. It exists so the HTTP data layer is exercised against a
 * live API before production, with analytics off so test traffic never pollutes
 * real metrics.
 *
 * `apiBaseUrl` points at a backend running on this machine, because that is
 * where the only real backend currently runs. Nothing is deployed yet, and a
 * hostname for a server that does not exist would make this build fail in a way
 * that looks like a bug rather than a missing deployment. Repoint it when the
 * backend is hosted.
 */
export const environment: AppEnvironment = {
  name: 'staging',
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
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
