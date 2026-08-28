import { HttpClient, HttpContext, HttpContextToken, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AppError } from '../../domain';
import { isTransient, mapHttpError } from './http-error.mapper';

/** Marks a request as safe to retry automatically. Set by the client, not callers. */
export const RETRYABLE = new HttpContextToken<boolean>(() => false);

export interface RequestOptions {
  /** Query parameters. `undefined` values are dropped rather than sent as "undefined". */
  readonly params?: Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;
  /**
   * Idempotency key for a mutating request. Supplying one makes a retry safe:
   * the backend returns the original result instead of acting twice.
   */
  readonly idempotencyKey?: string;
}

/**
 * The single HTTP entry point for the data layer.
 *
 * Everything that crosses the network goes through here, which is what makes the
 * cross-cutting guarantees enforceable in one place:
 *
 * - every URL is versioned (`{apiBaseUrl}/{apiVersion}/...`)
 * - every request carries a correlation id so a customer report maps to a log line
 * - every request sends cookies (`withCredentials`), because the session is an
 *   httpOnly cookie and never a token this app can read
 * - every request has a timeout, so a hanging backend cannot hang the UI
 * - every failure arrives as an `AppError`, never as an `HttpErrorResponse`
 * - only idempotent verbs are retried automatically
 *
 * No service above this one may inject `HttpClient` directly.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.request<T>('POST', path, body, options);
  }

  patch<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Observable<T> {
    const isRead = method === 'GET';
    const headers: Record<string, string> = {};
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const request$ = this.http.request<T>(method, this.url(path), {
      body,
      params: toParams(options.params),
      headers,
      withCredentials: true,
      context: new HttpContext().set(RETRYABLE, isRead || Boolean(options.idempotencyKey)),
    });

    return request$.pipe(
      timeout(environment.requestTimeoutMs),
      catchError((error: unknown) => throwError(() => mapHttpError(error))),
      // A read, or a write carrying an idempotency key, may be retried once on a
      // transient failure. A write without a key never is: a repeat could create
      // a second order.
      retry({
        count: 1,
        delay: (error: AppError) => {
          const retryable = isRead || Boolean(options.idempotencyKey);
          if (!retryable || !isTransient(error)) {
            return throwError(() => error);
          }
          const waitMs = (error.retryAfterSeconds ?? 1) * 1000;
          return timer(Math.min(waitMs, 5_000));
        },
      }),
    );
  }

  /** `/api` + `/v1` + path. Callers pass version-free paths like `/products`. */
  private url(path: string): string {
    const base = environment.apiBaseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}/${environment.apiVersion}${suffix}`;
  }
}

function toParams(
  source: RequestOptions['params'],
): HttpParams | undefined {
  if (!source) {
    return undefined;
  }
  let params = new HttpParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        params = params.append(key, String(entry));
      }
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
