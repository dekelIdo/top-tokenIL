/**
 * Shape of the panel's build-time configuration.
 *
 * Kept apart from the values because `environment.ts` is swapped for
 * `environment.production.ts` at build time. A production file that imported
 * the type from the file it replaces would import from itself.
 *
 * SECURITY: whatever satisfies this ships to the browser. It holds an API
 * address and nothing else. The operator token is typed at sign-in and lives
 * only in the browser tab; a token in a config file is a token in the
 * repository and in its history forever.
 */
export interface AdminEnvironment {
  readonly production: boolean;
  /** Origin and prefix, without the version segment. */
  readonly apiBaseUrl: string;
  readonly apiVersion: 'v1';
}
