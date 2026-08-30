import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, combineLatest } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { AppError, toAppError } from '../../domain';
import { CatalogFacade } from '../../state';
import { EmptyStateComponent, ErrorStateComponent, ProductCardComponent, SkeletonGridComponent } from '../../ui';
import { signal } from '@angular/core';

/** A single game and everything sold for it. */
@Component({
  selector: 'tt-game-detail-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    ProductCardComponent, SkeletonGridComponent, EmptyStateComponent, ErrorStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <tt-error-state *ngIf="error() as appError; else content" [error]="appError"></tt-error-state>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <nav class="crumbs tt-faint">
            <a routerLink="/games">משחקים</a> / <span>{{ vm.game.name | t }}</span>
          </nav>

          <header class="head" [style.--accent]="vm.game.accentColor || 'var(--tt-brand-500)'">
            <span class="tt-eyebrow">{{ vm.game.publisher }}</span>
            <h1>{{ vm.game.name | t }}</h1>
            <p class="tt-muted">{{ vm.game.shortDescription | t }}</p>
          </header>

          <tt-empty-state *ngIf="vm.products.length === 0"
                          title="אין כרגע מוצרים למשחק הזה"
                          message="אין כרגע מוצרים למשחק הזה. אפשר לעיין בשאר החנות.">
          </tt-empty-state>

          <div class="tt-grid" *ngIf="vm.products.length > 0">
            <tt-product-card *ngFor="let product of vm.products"
                             [product]="product"
                             [lookups]="vm.lookups">
            </tt-product-card>
          </div>
        </ng-container>
      </ng-template>

      <ng-template #loading><tt-skeleton-grid [count]="4"></tt-skeleton-grid></ng-template>
    </div>
  `,
  styles: [`
    .crumbs { margin-block-end: var(--tt-space-3); }
    .head { margin-block-end: var(--tt-space-5); }
    .head h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .tt-eyebrow { color: var(--accent); }
  `],
})
export class GameDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly error = signal<AppError | undefined>(undefined);

  readonly vm$ = this.route.paramMap.pipe(
    map((params) => params.get('gameSlug') ?? ''),
    switchMap((slug) => combineLatest([
      this.catalog.gameBySlug(slug),
      this.catalog.productsForGame(slug),
      this.catalog.lookups$,
    ])),
    map(([game, products, lookups]) => ({ game, products, lookups })),
    catchError((error: unknown) => {
      this.error.set(toAppError(error));
      return EMPTY;
    }),
  );

  constructor() {
    this.analytics.pageView('/games/:gameSlug', 'Game detail');
  }
}
