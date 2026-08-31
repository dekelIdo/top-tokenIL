import { Pipe, PipeTransform } from '@angular/core';

/**
 * Minor units to a readable amount.
 *
 * Every amount crosses the API in minor units (agorot), because a float would
 * accumulate rounding error on the way. Division happens here, at the last
 * moment before a human reads it, and nowhere else.
 */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(minor: number | null | undefined, currency = 'ILS'): string {
    if (minor === null || minor === undefined) {
      return '—';
    }

    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  }
}
