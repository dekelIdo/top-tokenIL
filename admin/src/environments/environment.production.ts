import { AdminEnvironment } from './environment.model';

/**
 * Deployed operator panel.
 *
 * `apiBaseUrl` is relative, so the panel talks to whatever host serves it. That
 * keeps the deployed address out of the repository and means the panel is
 * reachable only from behind whatever protects that host.
 *
 * Repoint this only if the panel is ever served from a different origin than
 * the API, which would also mean adding that origin to `CORS_ALLOWED_ORIGINS`.
 */
export const environment: AdminEnvironment = {
  production: true,
  apiBaseUrl: '/api',
  apiVersion: 'v1',
};
