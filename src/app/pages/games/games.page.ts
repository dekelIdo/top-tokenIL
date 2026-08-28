import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AnalyticsService } from '../../core/analytics';
import { CatalogFacade } from '../../state';
import { GameCardComponent } from '../../ui';

/** Game directory. The list is data — adding a game adds a card here. */
@Component({
  selector: 'tt-games-page',
  standalone: true,
  imports: [CommonModule, GameCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <span class="tt-eyebrow">קטלוג</span>
      <h1>משחקים ופלטפורמות</h1>
      <p class="tt-muted">בחרו משחק כדי לראות את המוצרים שזמינים עבורו.</p>

      <div class="tt-grid">
        <tt-game-card *ngFor="let game of games$ | async" [game]="game"></tt-game-card>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .tt-grid { margin-block-start: var(--tt-space-5); }
  `],
})
export class GamesPage {
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly games$ = this.catalog.games$;

  constructor() {
    this.analytics.pageView('/games', 'Games');
  }
}
