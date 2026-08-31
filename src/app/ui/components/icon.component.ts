import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The icon set.
 *
 * Inline SVG paths rather than an icon font or a package. Three reasons: they
 * inherit `currentColor` so an icon always matches the text beside it, they cost
 * no extra request, and nothing arrives late and shifts the layout.
 *
 * This replaces the emoji the header used to use. Emoji render differently on
 * every platform, cannot be recoloured, sit on the wrong baseline, and are the
 * clearest possible signal that nobody designed the interface.
 *
 * Icons are decorative by default and hidden from assistive technology; the
 * control around them carries the label.
 */
export type IconName =
  | 'cart'
  | 'user'
  | 'search'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'check'
  | 'shield'
  | 'bolt'
  | 'clock'
  | 'globe'
  | 'tag'
  | 'gamepad'
  | 'arrow';

const PATHS: Record<IconName, string> = {
  cart: 'M3 4h2.2l2.1 10.4a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.55L20.5 8H6.4M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 13l4 4L19 7',
  shield: 'M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3Zm-2.5 9 2 2 4-4.5',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.4 3.8 5.6 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z',
  tag: 'M3 12.5V4h8.5L21 13.5 13.5 21 3 12.5Zm4.5-5.2h.01',
  gamepad: 'M7 12h4m-2-2v4m6.5 0h.01M18 11h.01M8.5 6h7a5.5 5.5 0 0 1 5.4 6.5l-.6 3.3A3 3 0 0 1 17.4 18c-1 0-1.9-.5-2.5-1.3l-.6-.9h-4.6l-.6.9A3 3 0 0 1 6.6 18a3 3 0 0 1-2.9-2.2l-.6-3.3A5.5 5.5 0 0 1 8.5 6Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

@Component({
  selector: 'tt-icon',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label">
      <path [attr.d]="path"></path>
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; flex: none; }
    /* The arrow leads the eye forward, which in an RTL page means leftward. */
    :host([dir='auto']) svg { transform: scaleX(-1); }
  `],
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 20;
  @Input() strokeWidth = 1.75;

  /** Set only when the icon is the sole meaning; otherwise the control labels it. */
  @Input() label?: string;

  get path(): string {
    return PATHS[this.name] ?? '';
  }
}
