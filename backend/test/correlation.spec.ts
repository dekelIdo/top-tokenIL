import type { Response } from 'express';

import {
  CorrelatedRequest,
  CorrelationMiddleware,
} from '../src/common/interceptors/correlation.middleware';
import { redact } from '../src/common/logging/app-logger.service';

/**
 * Correlation id handling, tested at the unit level.
 *
 * Some of these inputs cannot travel over HTTP at all — Node refuses to send a
 * header containing a newline — so testing the middleware directly is the only
 * way to prove it sanitises rather than trusts.
 */
describe('CorrelationMiddleware', () => {
  const middleware = new CorrelationMiddleware();

  const run = (header?: string): { id: string; headerSet?: string } => {
    let headerSet: string | undefined;
    const req = {
      header: (name: string) => (name === 'X-Request-Id' ? header : undefined),
    } as unknown as CorrelatedRequest;
    const res = {
      setHeader: (_name: string, value: string) => {
        headerSet = value;
      },
    } as unknown as Response;

    middleware.use(req, res, () => undefined);
    return { id: req.correlationId as string, headerSet };
  };

  it('adopts a well-formed client id, so client and server logs line up', () => {
    expect(run('req-abc-123').id).toBe('req-abc-123');
  });

  it('mints a UUID when the client sends nothing', () => {
    expect(run(undefined).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a newline, which is the classic log-forging payload', () => {
    const { id } = run('evil\ninjected');
    expect(id).not.toContain('\n');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects JSON punctuation that could forge a structured log line', () => {
    expect(run('a","level":"error').id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an over-long id rather than letting a header bloat every log line', () => {
    expect(run('x'.repeat(500)).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an empty id', () => {
    expect(run('').id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('always writes the id it chose onto the response', () => {
    const { id, headerSet } = run('req-xyz');
    expect(headerSet).toBe(id);
  });
});

/**
 * Log redaction. The blocklist exists so that a careless call site cannot write
 * a sign-in code or a session cookie into the log; it is applied centrally
 * rather than trusted to each caller.
 */
describe('log redaction', () => {
  it('redacts an OTP code', () => {
    expect(redact({ otpCode: '123456' }).otpCode).toBe('[redacted]');
  });

  it('redacts session and authentication material', () => {
    const safe = redact({ sessionToken: 'abc', cookie: 'x=y', authorization: 'Bearer z' });
    expect(safe.sessionToken).toBe('[redacted]');
    expect(safe.cookie).toBe('[redacted]');
    expect(safe.authorization).toBe('[redacted]');
  });

  it('redacts anything card-shaped', () => {
    const safe = redact({ cardNumber: '4111111111111111', cvv: '123', pan: '4111' });
    expect(safe.cardNumber).toBe('[redacted]');
    expect(safe.cvv).toBe('[redacted]');
    expect(safe.pan).toBe('[redacted]');
  });

  it('keeps the operational fields an on-call engineer actually needs', () => {
    const safe = redact({ requestId: 'req-1', status: 500, path: '/api/v1/orders', code: 'X' });
    expect(safe.requestId).toBe('req-1');
    expect(safe.status).toBe(500);
    expect(safe.path).toBe('/api/v1/orders');
    // `code` is the error code, not a sign-in code, so it survives.
    expect(safe.code).toBe('X');
  });

  it('drops undefined values instead of logging the string "undefined"', () => {
    expect(Object.keys(redact({ a: undefined, b: 1 }))).toEqual(['b']);
  });
});
