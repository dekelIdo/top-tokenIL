import { Inject, Injectable, LoggerService } from '@nestjs/common';

import { APP_CONFIG } from '../../config/config.module';
import { AppConfig, LogLevel } from '../../config/environment';

/** Flat, primitive context. Objects would invite dumping a whole request body. */
export type LogContext = Record<string, string | number | boolean | undefined>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured JSON logging.
 *
 * One line per event, so a log aggregator can query by `requestId`, `orderId` or
 * `code` without parsing prose.
 *
 * Redaction is applied to every context object rather than trusted to call
 * sites: a careless `logger.info('x', req.body)` must not be able to write an
 * OTP, a session cookie or card data into the log.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly threshold: number;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.threshold = LEVEL_ORDER[config.logLevel];
  }

  debug(message: string, context?: LogContext | string): void {
    this.write('debug', message, context);
  }

  log(message: string, context?: LogContext | string): void {
    this.write('info', message, context);
  }

  info(message: string, context?: LogContext | string): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext | string): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext | string): void {
    this.write('error', message, context);
  }

  verbose(message: string, context?: LogContext | string): void {
    this.write('debug', message, context);
  }

  /**
   * Nest calls its logger with a STRING second argument (the source class name),
   * while our own call sites pass a context object. Spreading a string would
   * explode it into numeric character keys, so the two shapes are separated here.
   */
  private write(level: LogLevel, message: string, context: LogContext | string = {}): void {
    if (LEVEL_ORDER[level] < this.threshold) {
      return;
    }
    const fields = typeof context === 'string' ? { source: context } : redact(context);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      env: this.config.nodeEnv,
      ...fields,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

/**
 * Keys whose values must never reach a log, matched as substrings so
 * `otpCode`, `sessionToken` and `cardNumber` are all caught.
 */
const REDACTED_KEYS = [
  'password', 'secret', 'token', 'cookie', 'authorization', 'otp', 'code',
  'card', 'cvv', 'pan', 'iban', 'session',
  // Customer contact details. Nothing logs them today; the entry is here so
  // that adding a log line later cannot quietly start writing addresses to
  // disk. An id is enough to reconstruct what happened to an order.
  'email', 'phone',
];

/** `code` is a legitimate field on an error; keep the error one, drop the rest. */
const ALLOWED_EXACT = new Set(['code', 'statusCode', 'errorCode']);

export function redact(context: LogContext): LogContext {
  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) {
      continue;
    }
    const lower = key.toLowerCase();
    if (!ALLOWED_EXACT.has(key) && REDACTED_KEYS.some((blocked) => lower.includes(blocked))) {
      safe[key] = '[redacted]';
      continue;
    }
    safe[key] = value;
  }
  return safe;
}
