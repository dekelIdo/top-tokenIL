import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IconComponent, IconName } from './icon.component';

/**
 * Trust signals. Every claim here is one the platform can actually keep.
 *
 * Class names are prefixed rather than generic. Several components live in this
 * file, and a bare `.list` in two of them collided: the FAQ accordion's rules
 * won, which left these rendering as a bulleted column instead of a grid. The
 * host is also given an explicit `display`, because a component host is inline
 * by default and an inline host cannot lay its children out.
 */
@Component({
  selector: 'tt-trust-badges',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="trust-list">
      <li class="trust-item" *ngFor="let signal of signals">
        <span class="trust-glyph" aria-hidden="true">
          <tt-icon [name]="signal.icon" [size]="18"></tt-icon>
        </span>
        <span class="trust-copy">
          <strong>{{ signal.title }}</strong>
          <span class="tt-faint">{{ signal.detail }}</span>
        </span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .trust-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--tt-space-3);
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .trust-item {
      display: flex;
      align-items: flex-start;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
    }
    /* A tinted tile behind the icon, so the row has an anchor and the icon is
       not floating next to the text. */
    .trust-glyph {
      display: grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      flex: none;
      border-radius: var(--tt-radius-md);
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
    }
    .trust-copy strong { display: block; font-size: var(--tt-text-sm); margin-block-end: 2px; }
    .trust-copy .tt-faint { display: block; line-height: var(--tt-leading-snug); }
  `],
})
export class TrustBadgesComponent {
  readonly signals: { icon: IconName; title: string; detail: string }[] = [
    { icon: 'shield', title: 'לא מבקשים סיסמאות', detail: 'לעולם לא נבקש סיסמה או קוד אימות' },
    { icon: 'globe', title: 'אזור מוצג מראש', detail: 'האזור של כל קוד מוצג לפני התשלום' },
    { icon: 'clock', title: 'זמן אספקה גלוי', detail: 'הזמן המשוער מופיע על כל מוצר' },
    { icon: 'user', title: 'תמיכה בעברית', detail: 'צוות ישראלי, מענה בעברית' },
  ];
}
