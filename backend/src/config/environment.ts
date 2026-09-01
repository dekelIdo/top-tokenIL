/**
 * Environment loading and validation.
 *
 * The application refuses to boot rather than start in a half-configured state.
 * A misconfigured production deployment that runs is far more dangerous than one
 * that fails at startup: a missing `SESSION_SECRET` would silently sign sessions
 * with a default, and a missing CORS allowlist would either block every customer
 * or, if defaulted to `*`, expose the API.
 *
 * Development gets forgiving defaults. Production gets none.
 */

export type NodeEnv = 'development' | 'test' | 'staging' | 'production';
export type PaymentMode = 'sandbox' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where customer notifications go. `log` sends nothing and is development only. */
export type NotificationTransport = 'log' | 'none';

/** One operator of the admin API. The token authenticates; the name attributes. */
export interface OperatorCredential {
  readonly name: string;
  readonly token: string;
}

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  /** True for staging and production, which share the same hardening. */
  readonly isDeployed: boolean;
  readonly port: number;

  readonly databaseUrl: string;

  readonly sessionSecret: string;
  readonly cookieSecure: boolean;
  readonly cookieSameSite: 'lax' | 'strict' | 'none';
  readonly cookieDomain?: string;

  readonly corsAllowedOrigins: readonly string[];

  readonly otpTtlSeconds: number;
  readonly otpMaxAttempts: number;
  /**
   * Development-only escape hatch that returns the OTP in the API response so a
   * developer can sign in without a mail provider. Refused outright in a
   * deployed environment; see `validateEnvironment`.
   */
  readonly otpDevEcho: boolean;

  readonly paymentMode: PaymentMode;
  /**
   * Verifies webhook signatures. A provider signs each delivery with it, so a
   * forged or replayed callback can be rejected before it reaches the state
   * machine. Required in a deployed environment; a development default exists so
   * the sandbox works out of the box.
   */
  readonly paymentWebhookSecret: string;

  /**
   * Where order notifications go. `log` writes them to the application log and
   * sends nothing, which is fine locally and refused once deployed: a customer
   * whose code was never emailed has not been served.
   */
  readonly notificationTransport: NotificationTransport;

  /**
   * Google sign-in. Both must be present for it to be offered at all; a half
   * configured provider is worse than none, because the button appears and then
   * fails. `isConfigured` on the service is the single check everything else
   * reads.
   */
  readonly googleClientId?: string;
  readonly googleClientSecret?: string;
  /** Must match a redirect URI registered in the Google Cloud console exactly. */
  readonly googleRedirectUri: string;

  /** Where the backend sends a customer after a federated sign-in completes. */
  readonly appBaseUrl: string;

  /** How often housekeeping releases expired holds. Zero disables the sweep. */
  readonly housekeepingIntervalSeconds: number;

  /**
   * Named operator credentials for the admin API, one per person.
   *
   * Named rather than shared, because every operator action is written to the
   * audit log and "someone marked this order delivered" is not an audit trail.
   * An empty list disables the admin API outright: no default token exists, so
   * a deployment that forgets to configure operators exposes nothing.
   */
  readonly operators: readonly OperatorCredential[];

  readonly logLevel: LogLevel;
  readonly requestBodyLimit: string;
}

export class EnvironmentValidationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'EnvironmentValidationError';
    this.problems = problems;
  }
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'staging', 'production'];
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Minimum entropy for a signing secret, in characters of a random string. */
const MIN_SECRET_LENGTH = 32;

export function validateEnvironment(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const nodeEnv = pickEnum(source.NODE_ENV, NODE_ENVS, 'development');
  const isDeployed = nodeEnv === 'staging' || nodeEnv === 'production';

  const port = toInt(source.PORT, 3000);
  if (port <= 0 || port > 65535) {
    problems.push(`PORT must be between 1 and 65535, received "${source.PORT}"`);
  }

  // --- Database ------------------------------------------------------------
  // Phase A has no database yet, so a missing URL is tolerated outside deployed
  // environments. Phase B tightens this to always-required.
  const databaseUrl = source.DATABASE_URL ?? '';
  if (isDeployed && databaseUrl.length === 0) {
    problems.push('DATABASE_URL is required in staging and production');
  }
  if (databaseUrl.length > 0 && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must be a postgresql:// connection string');
  }

  // --- Sessions ------------------------------------------------------------
  const sessionSecret = source.SESSION_SECRET ?? '';
  if (isDeployed) {
    if (sessionSecret.length === 0) {
      problems.push('SESSION_SECRET is required in staging and production');
    } else if (sessionSecret.length < MIN_SECRET_LENGTH) {
      problems.push(
        `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (received ${sessionSecret.length})`,
      );
    }
    if (isWeakSecret(sessionSecret)) {
      problems.push('SESSION_SECRET looks like a placeholder; generate a random value');
    }
  }

  const cookieSecure = toBool(source.COOKIE_SECURE, isDeployed);
  if (isDeployed && !cookieSecure) {
    problems.push('COOKIE_SECURE must be true in staging and production');
  }

  const cookieSameSite = pickEnum(
    source.COOKIE_SAME_SITE,
    ['lax', 'strict', 'none'] as const,
    'lax',
  );
  if (cookieSameSite === 'none' && !cookieSecure) {
    problems.push('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }

  // --- CORS ----------------------------------------------------------------
  const corsAllowedOrigins = splitList(source.CORS_ALLOWED_ORIGINS);
  if (isDeployed && corsAllowedOrigins.length === 0) {
    problems.push('CORS_ALLOWED_ORIGINS is required in staging and production');
  }
  if (corsAllowedOrigins.includes('*')) {
    // Wildcard plus credentials is rejected by browsers anyway, and signals a
    // misconfiguration rather than an intention.
    problems.push('CORS_ALLOWED_ORIGINS must not contain "*"; list exact origins');
  }

  // --- OTP -----------------------------------------------------------------
  const otpTtlSeconds = toInt(source.OTP_TTL_SECONDS, 600);
  if (otpTtlSeconds < 60 || otpTtlSeconds > 3600) {
    problems.push('OTP_TTL_SECONDS must be between 60 and 3600');
  }
  const otpMaxAttempts = toInt(source.OTP_MAX_ATTEMPTS, 5);
  if (otpMaxAttempts < 1 || otpMaxAttempts > 10) {
    problems.push('OTP_MAX_ATTEMPTS must be between 1 and 10');
  }

  const otpDevEcho = toBool(source.OTP_DEV_ECHO, false);
  if (isDeployed && otpDevEcho) {
    problems.push(
      'OTP_DEV_ECHO must be false outside local development: it returns sign-in codes in API responses',
    );
  }

  // --- Payments ------------------------------------------------------------
  const paymentMode = pickEnum(source.PAYMENT_MODE, ['sandbox', 'production'] as const, 'sandbox');
  if (paymentMode === 'production') {
    // No provider is integrated yet. Refusing here means nobody can flip a flag
    // and believe real payments are being taken.
    problems.push(
      'PAYMENT_MODE=production is not supported: no payment provider is integrated yet',
    );
  }

  const paymentWebhookSecret = source.PAYMENT_WEBHOOK_SECRET ?? '';
  if (isDeployed) {
    if (paymentWebhookSecret.length === 0) {
      problems.push('PAYMENT_WEBHOOK_SECRET is required in staging and production');
    } else if (paymentWebhookSecret.length < MIN_SECRET_LENGTH) {
      problems.push(
        `PAYMENT_WEBHOOK_SECRET must be at least ${MIN_SECRET_LENGTH} characters (received ${paymentWebhookSecret.length})`,
      );
    }
    if (isWeakSecret(paymentWebhookSecret)) {
      problems.push('PAYMENT_WEBHOOK_SECRET looks like a placeholder; generate a random value');
    }
  }

  // --- Notifications -------------------------------------------------------
  const notificationTransport = pickEnum(
    source.NOTIFICATION_TRANSPORT,
    ['log', 'none'] as const,
    'log',
  );
  if (isDeployed && notificationTransport === 'log') {
    // Writing an order confirmation to a log file is not delivering it. Rather
    // than let a deployment silently drop every customer email, refuse to start
    // until a real transport is configured.
    problems.push(
      'NOTIFICATION_TRANSPORT=log is a development sink and must not be used in staging or production',
    );
  }

  // --- Federated sign-in ---------------------------------------------------
  const googleClientId = source.GOOGLE_CLIENT_ID || undefined;
  const googleClientSecret = source.GOOGLE_CLIENT_SECRET || undefined;

  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    // One without the other is a misconfiguration that would present a sign-in
    // button which cannot work. Refuse to start rather than ship it.
    problems.push(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together, or both left empty',
    );
  }

  const appBaseUrl = source.APP_BASE_URL || 'http://localhost:4200';
  const googleRedirectUri =
    source.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/google/callback';

  if (isDeployed && googleClientId && !googleRedirectUri.startsWith('https://')) {
    problems.push('GOOGLE_REDIRECT_URI must be an https URL in staging and production');
  }

  const housekeepingIntervalSeconds = toInt(source.HOUSEKEEPING_INTERVAL_SECONDS, 60);
  if (housekeepingIntervalSeconds < 0 || housekeepingIntervalSeconds > 3600) {
    problems.push('HOUSEKEEPING_INTERVAL_SECONDS must be between 0 and 3600');
  }

  // --- Operators -----------------------------------------------------------
  // `ADMIN_TOKENS` is a comma-separated list of `name:token` pairs. Absent, the
  // admin API refuses every request; there is deliberately no default token,
  // because a default that works is a default that ships.
  const operators = parseOperators(source.ADMIN_TOKENS, problems, isDeployed);

  const logLevel = pickEnum(source.LOG_LEVEL, LOG_LEVELS, isDeployed ? 'info' : 'debug');
  const requestBodyLimit = source.REQUEST_BODY_LIMIT ?? '100kb';

  if (problems.length > 0) {
    throw new EnvironmentValidationError(problems);
  }

  return {
    nodeEnv,
    isDeployed,
    port,
    databaseUrl,
    sessionSecret,
    cookieSecure,
    cookieSameSite,
    cookieDomain: source.COOKIE_DOMAIN || undefined,
    corsAllowedOrigins,
    otpTtlSeconds,
    otpMaxAttempts,
    otpDevEcho,
    paymentMode,
    paymentWebhookSecret: paymentWebhookSecret || 'development-only-webhook-secret',
    notificationTransport,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    appBaseUrl,
    housekeepingIntervalSeconds,
    operators,
    logLevel,
    requestBodyLimit,
  };
}

// --- helpers ---------------------------------------------------------------

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const match = allowed.find((candidate) => candidate === value);
  return match ?? fallback;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Parses `name:token,name:token` into named operator credentials.
 *
 * A malformed entry is a hard failure rather than a skipped line. Silently
 * dropping an operator would leave someone unable to sign in with no
 * explanation, and silently dropping the *only* operator would leave the admin
 * API open to nobody while appearing configured.
 */
function parseOperators(
  value: string | undefined,
  problems: string[],
  isDeployed: boolean,
): OperatorCredential[] {
  const entries = splitList(value);

  if (entries.length === 0) {
    if (isDeployed) {
      problems.push(
        'ADMIN_TOKENS is required in staging and production: without it no operator can deliver an order',
      );
    }
    return [];
  }

  const operators: OperatorCredential[] = [];
  const seenNames = new Set<string>();
  const seenTokens = new Set<string>();

  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator <= 0 || separator === entry.length - 1) {
      problems.push(`ADMIN_TOKENS entries must look like "name:token"; received "${redact(entry)}"`);
      continue;
    }

    const name = entry.slice(0, separator).trim();
    const token = entry.slice(separator + 1).trim();

    if (!/^[a-z0-9_-]{2,32}$/i.test(name)) {
      problems.push(
        `ADMIN_TOKENS operator name "${name}" must be 2-32 characters of letters, digits, "-" or "_"`,
      );
    }
    if (seenNames.has(name.toLowerCase())) {
      problems.push(`ADMIN_TOKENS contains the operator name "${name}" more than once`);
    }
    seenNames.add(name.toLowerCase());

    // A short operator token is a guessable one, and it authorises marking
    // orders delivered and reading every customer's contact details.
    if (token.length < MIN_SECRET_LENGTH) {
      problems.push(
        `ADMIN_TOKENS token for "${name}" must be at least ${MIN_SECRET_LENGTH} characters (received ${token.length})`,
      );
    }
    if (isWeakSecret(token)) {
      problems.push(`ADMIN_TOKENS token for "${name}" looks like a placeholder; generate a random value`);
    }
    if (seenTokens.has(token)) {
      // Two operators sharing a token destroys the attribution the audit log
      // exists to provide.
      problems.push('ADMIN_TOKENS contains the same token for more than one operator');
    }
    seenTokens.add(token);

    operators.push({ name, token });
  }

  return operators;
}

/** Keeps a malformed entry out of the error message, in case it held a secret. */
function redact(entry: string): string {
  const separator = entry.indexOf(':');
  return separator > 0 ? `${entry.slice(0, separator)}:***` : '***';
}

/** Catches the obvious copy-paste-from-the-example-file mistake. */
function isWeakSecret(secret: string): boolean {
  const weak = ['change-me', 'changeme', 'secret', 'placeholder', 'your-secret', 'replace-me'];
  const lower = secret.toLowerCase();
  return weak.some((candidate) => lower.includes(candidate));
}
