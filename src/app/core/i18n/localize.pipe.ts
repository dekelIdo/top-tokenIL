import { Pipe, PipeTransform, inject } from '@angular/core';

import { LocalizedText } from '../../domain';
import { LocaleService } from './locale.service';

/** `{{ product.name | t }}` — resolves LocalizedText in templates. */
@Pipe({ name: 't', standalone: true, pure: false })
export class LocalizePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  transform(value: LocalizedText | undefined | null): string {
    return value ? this.locale.text(value) : '';
  }
}
