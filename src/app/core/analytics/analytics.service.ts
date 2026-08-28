import { Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { LoggerService } from '../logger.service';
import { AnalyticsEvent, AnalyticsPayload } from './analytics.events';

/**
 * Keys that must never leave the browser in an analytics payload. The service
 * strips them rather than trusting call sites, so a careless `track(..., form.value)`
 * cannot leak an email address, a player handle or anything payment-related.
 */
const BLOCKED_KEYS = [
  'email', 'phone', 'password', 'token', 'code', 'card', 'cvv', 'pan', 'iban',
  'handle', 'playerid', 'psn', 'name', 'address', 'secret',
];

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly logger = inject(LoggerService);

  track(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
    if (!environment.analyticsEnabled) {
      this.logger.debug(`analytics (disabled): ${event}`, this.sanitize(payload));
      return;
    }
    // A real provider is bound here once one is chosen. Until then nothing is
    // transmitted — the app does not pretend an analytics integration exists.
    this.logger.debug(`analytics: ${event}`, this.sanitize(payload));
  }

  pageView(path: string, title: string): void {
    this.track(AnalyticsEvent.PageView, { path, title });
  }

  private sanitize(payload: AnalyticsPayload): Record<string, string | number | boolean> {
    const safe: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(payload)) {
      const normalized = key.toLowerCase();
      if (BLOCKED_KEYS.some((blocked) => normalized.includes(blocked))) {
        continue;
      }
      safe[key] = value;
    }
    return safe;
  }
}
