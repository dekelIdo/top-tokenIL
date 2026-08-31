import { AdminEnvironment } from './environment.model';

/** Local development: the backend runs on this machine. */
export const environment: AdminEnvironment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  apiVersion: 'v1',
};
