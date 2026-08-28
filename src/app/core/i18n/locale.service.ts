import { Injectable, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { LocaleCode, LocalizedText, resolveText } from '../../domain';

/**
 * Locale and direction state.
 *
 * The storefront is Hebrew-first and therefore RTL by default, but direction is
 * derived from the locale rather than assumed, and layout uses logical CSS
 * properties so switching to English needs no per-component work.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly current = signal<LocaleCode>(environment.defaultLocale);

  readonly locale = this.current.asReadonly();

  get direction(): 'rtl' | 'ltr' {
    return this.current() === 'he' ? 'rtl' : 'ltr';
  }

  setLocale(locale: LocaleCode): void {
    this.current.set(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = this.direction;
  }

  /** Resolves a LocalizedText against the active locale. */
  text(value: LocalizedText | undefined): string {
    return value === undefined ? '' : resolveText(value, this.current());
  }
}
