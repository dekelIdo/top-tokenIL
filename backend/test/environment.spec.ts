import { EnvironmentValidationError, validateEnvironment } from '../src/config/environment';

/**
 * Configuration validation.
 *
 * The point of these tests is that a misconfigured deployment cannot start. A
 * service that boots with a missing session secret or an open CORS policy is
 * more dangerous than one that refuses to boot, because nobody notices.
 */

const deployed = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db:5432/toptoken',
  SESSION_SECRET: 'a'.repeat(48),
  PAYMENT_WEBHOOK_SECRET: 'b'.repeat(48),
  // `log` is a development sink that delivers nothing, so a deployed
  // environment has to say explicitly what it wants instead.
  NOTIFICATION_TRANSPORT: 'none',
  COOKIE_SECURE: 'true',
  CORS_ALLOWED_ORIGINS: 'https://easycoins-web.vercel.app',
  // Without at least one operator nobody can deliver an order, so a deployment
  // that omits this is broken in a way that only shows up after a sale.
  ADMIN_TOKENS: `yuval:${'c'.repeat(48)},dekel:${'d'.repeat(48)}`,
};

const problemsOf = (env: NodeJS.ProcessEnv): string[] => {
  try {
    validateEnvironment(env);
    return [];
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      return [...error.problems];
    }
    throw error;
  }
};

describe('environment validation: development defaults', () => {
  it('boots with an empty environment, so a new developer can start immediately', () => {
    const config = validateEnvironment({});
    expect(config.nodeEnv).toBe('development');
    expect(config.isDeployed).toBe(false);
    expect(config.port).toBe(3000);
  });

  it('defaults cookies to insecure locally, because localhost is not HTTPS', () => {
    expect(validateEnvironment({}).cookieSecure).toBe(false);
  });

  it('defaults housekeeping to a sensible interval', () => {
    expect(validateEnvironment({}).housekeepingIntervalSeconds).toBe(60);
  });

  it('allows the log notification sink locally, where nothing is delivered', () => {
    expect(validateEnvironment({}).notificationTransport).toBe('log');
  });

  it('defaults to sandbox payments', () => {
    expect(validateEnvironment({}).paymentMode).toBe('sandbox');
  });

  it('allows the OTP dev echo locally', () => {
    expect(validateEnvironment({ OTP_DEV_ECHO: 'true' }).otpDevEcho).toBe(true);
  });

  it('parses a comma-separated CORS allowlist and trims whitespace', () => {
    const config = validateEnvironment({
      CORS_ALLOWED_ORIGINS: 'http://localhost:4200 , http://localhost:4321',
    });
    expect(config.corsAllowedOrigins).toEqual([
      'http://localhost:4200',
      'http://localhost:4321',
    ]);
  });
});

describe('environment validation: production fails fast', () => {
  it('accepts a fully configured production environment', () => {
    const config = validateEnvironment(deployed);
    expect(config.isDeployed).toBe(true);
    expect(config.nodeEnv).toBe('production');
  });

  it('treats staging with the same hardening as production', () => {
    expect(validateEnvironment({ ...deployed, NODE_ENV: 'staging' }).isDeployed).toBe(true);
  });

  it('refuses to start without a webhook secret', () => {
    const problems = problemsOf({ ...deployed, PAYMENT_WEBHOOK_SECRET: undefined });
    expect(problems.some((p) => p.includes('PAYMENT_WEBHOOK_SECRET'))).toBe(true);
  });

  it('rejects a short webhook secret', () => {
    const problems = problemsOf({ ...deployed, PAYMENT_WEBHOOK_SECRET: 'short' });
    expect(problems.some((p) => p.includes('PAYMENT_WEBHOOK_SECRET'))).toBe(true);
  });

  it('rejects a placeholder webhook secret', () => {
    const problems = problemsOf({ ...deployed, PAYMENT_WEBHOOK_SECRET: 'change-me-change-me-change-me-change-me' });
    expect(problems.some((p) => p.includes('placeholder'))).toBe(true);
  });

  it('refuses the development notification sink once deployed', () => {
    // Writing an order confirmation to a log file is not sending it. Starting
    // anyway would drop every customer email silently.
    const problems = problemsOf({ ...deployed, NOTIFICATION_TRANSPORT: 'log' });
    expect(problems.some((p) => p.includes('NOTIFICATION_TRANSPORT'))).toBe(true);
  });

  it('rejects an out-of-range housekeeping interval', () => {
    const problems = problemsOf({ ...deployed, HOUSEKEEPING_INTERVAL_SECONDS: '99999' });
    expect(problems.some((p) => p.includes('HOUSEKEEPING_INTERVAL_SECONDS'))).toBe(true);
  });

  it('refuses to start without DATABASE_URL', () => {
    const problems = problemsOf({ ...deployed, DATABASE_URL: undefined });
    expect(problems.some((p) => p.includes('DATABASE_URL'))).toBe(true);
  });

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    const problems = problemsOf({ ...deployed, DATABASE_URL: 'mysql://user@host/db' });
    expect(problems.some((p) => p.includes('postgresql://'))).toBe(true);
  });

  it('refuses to start without SESSION_SECRET', () => {
    const problems = problemsOf({ ...deployed, SESSION_SECRET: undefined });
    expect(problems.some((p) => p.includes('SESSION_SECRET'))).toBe(true);
  });

  it('rejects a short SESSION_SECRET', () => {
    const problems = problemsOf({ ...deployed, SESSION_SECRET: 'tooshort' });
    expect(problems.some((p) => p.includes('at least 32'))).toBe(true);
  });

  it('rejects a placeholder SESSION_SECRET copied from the example file', () => {
    const problems = problemsOf({ ...deployed, SESSION_SECRET: `change-me-${'x'.repeat(40)}` });
    expect(problems.some((p) => p.includes('placeholder'))).toBe(true);
  });

  it('rejects insecure cookies in production', () => {
    const problems = problemsOf({ ...deployed, COOKIE_SECURE: 'false' });
    expect(problems.some((p) => p.includes('COOKIE_SECURE'))).toBe(true);
  });

  it('rejects SameSite=none without Secure, which browsers would drop anyway', () => {
    const problems = problemsOf({
      ...deployed,
      COOKIE_SAME_SITE: 'none',
      COOKIE_SECURE: 'false',
    });
    expect(problems.some((p) => p.includes('COOKIE_SAME_SITE=none'))).toBe(true);
  });

  it('refuses to start without a CORS allowlist', () => {
    const problems = problemsOf({ ...deployed, CORS_ALLOWED_ORIGINS: undefined });
    expect(problems.some((p) => p.includes('CORS_ALLOWED_ORIGINS'))).toBe(true);
  });

  it('rejects a wildcard CORS origin in any environment', () => {
    const problems = problemsOf({ ...deployed, CORS_ALLOWED_ORIGINS: '*' });
    expect(problems.some((p) => p.includes('must not contain'))).toBe(true);
  });

  it('refuses to leak sign-in codes: OTP_DEV_ECHO cannot be true when deployed', () => {
    const problems = problemsOf({ ...deployed, OTP_DEV_ECHO: 'true' });
    expect(problems.some((p) => p.includes('OTP_DEV_ECHO'))).toBe(true);
  });

  it('refuses PAYMENT_MODE=production, because no provider is integrated', () => {
    const problems = problemsOf({ ...deployed, PAYMENT_MODE: 'production' });
    expect(problems.some((p) => p.includes('no payment provider is integrated'))).toBe(true);
  });

  it('rejects an out-of-range port', () => {
    const problems = problemsOf({ ...deployed, PORT: '70000' });
    expect(problems.some((p) => p.includes('PORT'))).toBe(true);
  });

  it('reports every problem at once rather than one per restart', () => {
    const problems = problemsOf({ NODE_ENV: 'production' });
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.some((p) => p.includes('DATABASE_URL'))).toBe(true);
    expect(problems.some((p) => p.includes('SESSION_SECRET'))).toBe(true);
    expect(problems.some((p) => p.includes('CORS_ALLOWED_ORIGINS'))).toBe(true);
  });

  it('throws a typed error whose message lists the problems', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      EnvironmentValidationError,
    );
  });
});

describe('operator credentials', () => {
  it('parses named operators so every action is attributable', () => {
    const config = validateEnvironment(deployed);

    expect(config.operators.map((operator) => operator.name)).toEqual(['yuval', 'dekel']);
  });

  it('leaves the admin API with no operators when none are configured locally', () => {
    // Development gets no default token. A default that works is a default that
    // reaches production.
    expect(validateEnvironment({}).operators).toEqual([]);
  });

  it('refuses to deploy without an operator', () => {
    const { ADMIN_TOKENS, ...withoutOperators } = deployed;
    const problems = problemsOf(withoutOperators);

    expect(problems.some((p) => p.includes('ADMIN_TOKENS'))).toBe(true);
  });

  it('rejects a short operator token', () => {
    const problems = problemsOf({ ...deployed, ADMIN_TOKENS: 'yuval:tooshort' });

    expect(problems.some((p) => p.includes('at least'))).toBe(true);
  });

  it('rejects a placeholder token', () => {
    const problems = problemsOf({ ...deployed, ADMIN_TOKENS: `yuval:change-me-${'x'.repeat(40)}` });

    expect(problems.some((p) => p.includes('placeholder'))).toBe(true);
  });

  it('rejects two operators sharing one token, which would destroy attribution', () => {
    const shared = 'e'.repeat(48);
    const problems = problemsOf({ ...deployed, ADMIN_TOKENS: `yuval:${shared},dekel:${shared}` });

    expect(problems.some((p) => p.includes('same token'))).toBe(true);
  });

  it('rejects a duplicated operator name', () => {
    const problems = problemsOf({
      ...deployed,
      ADMIN_TOKENS: `yuval:${'f'.repeat(48)},yuval:${'g'.repeat(48)}`,
    });

    expect(problems.some((p) => p.includes('more than once'))).toBe(true);
  });

  it('rejects a malformed entry rather than silently skipping it', () => {
    const problems = problemsOf({ ...deployed, ADMIN_TOKENS: 'no-colon-here' });

    expect(problems.some((p) => p.includes('name:token'))).toBe(true);
  });

  it('keeps the token out of the error message for a malformed entry', () => {
    const problems = problemsOf({ ...deployed, ADMIN_TOKENS: 'yuval' });

    expect(problems.join(' ')).not.toContain('yuval:');
  });
});

describe('serverless configuration', () => {
  it('reads a cron secret when present', () => {
    expect(validateEnvironment({ ...deployed, CRON_SECRET: 'x'.repeat(48) }).cronSecret).toBe(
      'x'.repeat(48),
    );
  });

  it('leaves the cron secret undefined when absent, so the endpoint stays closed', () => {
    expect(validateEnvironment(deployed).cronSecret).toBeUndefined();
  });

  it('allows housekeeping to be disabled, which is how a serverless host runs it', () => {
    // The in-process timer is off there; a scheduler drives the sweep instead.
    expect(validateEnvironment({ ...deployed, HOUSEKEEPING_INTERVAL_SECONDS: '0' }).housekeepingIntervalSeconds).toBe(0);
  });
})
