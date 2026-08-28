import { Pipe, PipeTransform, inject } from '@angular/core';

import { LocaleService } from '../core/i18n';
import { Money } from '../domain';

/**
 * Formats `Money` for display. Amounts are stored in minor units, so this is the
 * only place that converts to major units — no template does that arithmetic.
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  transform(value: Money | null | undefined, options: { showDecimals?: boolean } = {}): string {
    if (!value) {
      return '';
    }
    const major = value.amountMinor / 100;
    const showDecimals = options.showDecimals ?? major % 1 !== 0;
    return new Intl.NumberFormat(this.locale.locale() === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency',
      currency: value.currency,
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(major);
  }
}

/** Compact number formatting for quantities: 1,000,000 renders as 1M. */
@Pipe({ name: 'compactNumber', standalone: true })
export class CompactNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value >= 1_000_000) {
      return `${trim(value / 1_000_000)}M`;
    }
    if (value >= 1_000) {
      return `${trim(value / 1_000)}K`;
    }
    return new Intl.NumberFormat('he-IL').format(value);
  }
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
