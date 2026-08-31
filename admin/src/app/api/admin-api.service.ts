import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { TokenStore } from '../auth/token.store';

/** One listing the customer has to create. */
export interface TradeLine {
  readonly sequence: number;
  readonly binPrice: number;
  readonly netCoins: number;
}

export interface TradePlan {
  readonly requestedCoins: number;
  readonly deliveredCoins: number;
  readonly grossCoinsSpent: number;
  readonly taxCoins: number;
  readonly trades: readonly TradeLine[];
}

export interface QueueJob {
  readonly id: string;
  readonly orderId: string;
  readonly status: string;
  readonly method: string;
  readonly operatorId: string | null;
  readonly createdAt: string;
  readonly customerInstruction: (TradePlan & { playerName: string; kind: string }) | null;
  readonly failureReason: { he?: string; en?: string } | null;
  readonly order: {
    readonly orderNumber: string;
    readonly status: string;
    readonly contactEmail: string;
    readonly totalMinor: number;
    readonly currency: string;
    readonly createdAt: string;
    readonly checkoutValues: Record<string, string | boolean>;
  };
  readonly orderItem: {
    readonly displayName: Record<string, string>;
    readonly displayVariant: Record<string, string>;
    readonly quantity: number;
    readonly fulfillmentMethod: string;
  };
}

export interface Stats {
  readonly open: number;
  readonly waitingOnCustomer: number;
  readonly overdue: number;
  readonly failed: number;
  readonly deliveredToday: number;
  readonly revenueTodayMinor: number;
}

/**
 * The one place that talks to the operator API.
 *
 * Every request carries the operator's bearer token. Nothing here retries: an
 * operator action either happened or it did not, and a silent retry on
 * "mark delivered" is how one delivery becomes two.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly base = `${environment.apiBaseUrl}/${environment.apiVersion}/admin`;

  stats(): Observable<Stats> {
    return this.get<Stats>('/stats');
  }

  queue(filters: {
    status?: string;
    unclaimed?: boolean;
    overdue?: boolean;
    orderId?: string;
  }): Observable<{ items: QueueJob[]; total: number }> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '' && value !== false) {
        params = params.set(key, String(value));
      }
    }
    return this.get<{ items: QueueJob[]; total: number }>('/fulfillments', params);
  }

  job(id: string): Observable<QueueJob> {
    return this.get<QueueJob>(`/fulfillments/${id}`);
  }

  previewTrades(coins: number): Observable<TradePlan> {
    return this.get<TradePlan>('/trade-preview', new HttpParams().set('coins', String(coins)));
  }

  claim(id: string) {
    return this.post(`/fulfillments/${id}/claim`, {});
  }

  release(id: string) {
    return this.post(`/fulfillments/${id}/release`, {});
  }

  issueTradeInstruction(id: string, body: { playerName: string; coins: number; note?: string }) {
    return this.post(`/fulfillments/${id}/trade-instruction`, body);
  }

  deliver(id: string, payload: Record<string, unknown>) {
    return this.post(`/fulfillments/${id}/deliver`, { payload });
  }

  fail(id: string, reason: { he: string; en?: string }) {
    return this.post(`/fulfillments/${id}/fail`, { reason });
  }

  retry(id: string) {
    return this.post(`/fulfillments/${id}/retry`, {});
  }

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http
      .get<T>(`${this.base}${path}`, { headers: this.headers(), params })
      .pipe(catchError(toMessage));
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .post<T>(`${this.base}${path}`, body, { headers: this.headers() })
      .pipe(catchError(toMessage));
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.tokens.token() ?? ''}` });
  }
}

/**
 * Turns an error response into something an operator can act on.
 *
 * The backend sends a typed envelope with a Hebrew `userMessage`, so that is
 * preferred over anything invented here. A raw status code tells an operator
 * nothing about whether to try again or call someone.
 */
function toMessage(error: HttpErrorResponse) {
  const envelope = error.error?.error ?? error.error;

  // 401 is worded here rather than taken from the envelope. The backend's
  // message for it is written for a customer whose sign-in session expired,
  // which sends an operator looking for the wrong problem: they typed a bad
  // token, and no amount of waiting or reloading fixes that.
  const message =
    error.status === 401
      ? 'הטוקן נדחה. בדקו שהעתקתם אותו במלואו.'
      : error.status === 0
        ? 'אין חיבור לשרת. בדקו שהבקאנד רץ ושהמקור מורשה ב-CORS.'
        : (envelope?.userMessage?.he ??
           envelope?.message ??
           `השרת החזיר שגיאה (${error.status}).`);

  return throwError(() => new Error(message));
}
