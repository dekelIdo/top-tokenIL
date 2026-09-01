import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import {
  AppError, CatalogQuery, CatalogSort, DEFAULT_PAGE_SIZE, Page, Platform, Product, ProductType,
  Region, toAppError,
} from '../../domain';
import { CatalogFacade, CatalogLookups } from '../../state';
import {
  EmptyStateComponent, ErrorStateComponent, ProductCardComponent, SkeletonGridComponent,
} from '../../ui';

interface StoreViewModel {
  readonly page: Page<Product>;
  readonly lookups: CatalogLookups;
}

/**
 * The catalog.
 *
 * Filters are built from domain data — games, platforms, regions and product
 * types all come from the API — so a new game or a new product category appears
 * in the filter bar automatically. There is no coin-amount filter anywhere: that
 * concept belongs to one product category, not to the store.
 */
@Component({
  selector: 'tt-store-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LocalizePipe,
    ProductCardComponent, SkeletonGridComponent, EmptyStateComponent, ErrorStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <header class="head">
        <span class="tt-eyebrow">EA SPORTS FC</span>
        <h1>קוינס וקודים</h1>
        <p class="tt-muted">חבילות קוינס, נקודות FC ושירותים לחשבון. המחיר, הפלטפורמה ואזור החנות מופיעים על כל אפשרות.</p>
      </header>

      <form class="filters tt-panel" (submit)="$event.preventDefault()">
        <label class="tt-field grow search-field">
          <span class="tt-label">חיפוש</span>
          <input class="tt-input" type="search" [ngModel]="search$ | async" name="search"
                 (ngModelChange)="setSearch($event)" placeholder="שם מוצר, משחק או תגית…" />
        </label>

        <!-- On a phone the five selects filled the entire first screen, so a
             customer saw filters and no products. They collapse behind a
             summary below 720px and are forced open above it, which needs no
             JavaScript and stays keyboard accessible. -->
        <details class="refine" [open]="filtersOpen()" (toggle)="onFiltersToggle($event)">
          <summary>
            <span>סינון</span>
            <span class="refine__sign" aria-hidden="true"></span>
          </summary>
          <div class="refine__body">

        <label class="tt-field">
          <span class="tt-label">פלטפורמה</span>
          <select class="tt-select" name="platform" [ngModel]="platformId" (ngModelChange)="setPlatform($event)">
            <option value="">כל הפלטפורמות</option>
            <option *ngFor="let platform of platforms(lookups$ | async)" [value]="platform.id">
              {{ platform.name | t }}
            </option>
          </select>
        </label>

        <label class="tt-field">
          <span class="tt-label">אזור</span>
          <select class="tt-select" name="region" [ngModel]="regionId" (ngModelChange)="setRegion($event)">
            <option value="">כל האזורים</option>
            <option *ngFor="let region of regions(lookups$ | async)" [value]="region.id">{{ region.name | t }}</option>
          </select>
        </label>

        <label class="tt-field">
          <span class="tt-label">סוג מוצר</span>
          <select class="tt-select" name="type" [ngModel]="type" (ngModelChange)="setType($event)">
            <option value="">כל הסוגים</option>
            <option *ngFor="let entry of productTypes" [value]="entry.value">{{ entry.label }}</option>
          </select>
        </label>

        <label class="tt-field">
          <span class="tt-label">מיון</span>
          <select class="tt-select" name="sort" [ngModel]="sort" (ngModelChange)="setSort($event)">
            <option value="relevance">מומלץ</option>
            <option value="price-asc">מחיר: מהזול ליקר</option>
            <option value="price-desc">מחיר: מהיקר לזול</option>
            <option value="popular">פופולרי</option>
            <option value="name-asc">שם</option>
          </select>
        </label>

        <button type="button" class="tt-btn tt-btn--quiet" (click)="clear()" *ngIf="hasFilters">איפוס</button>
          </div>
        </details>
      </form>

      <ng-container *ngIf="error(); else content">
        <tt-error-state [error]="error()" (retry)="retry()"></tt-error-state>
      </ng-container>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <p class="count tt-faint">נמצאו {{ vm.page.total }} מוצרים</p>

          <tt-empty-state *ngIf="vm.page.items.length === 0"
                          title="לא נמצאו מוצרים"
                          message="נסו לשנות את החיפוש או לאפס את הסינון."
                          actionLabel="איפוס סינון"
                          (action)="clear()">
          </tt-empty-state>

          <h2 class="tt-visually-hidden">תוצאות החיפוש</h2>
          <div class="tt-grid" *ngIf="vm.page.items.length > 0">
            <tt-product-card *ngFor="let product of vm.page.items; trackBy: trackById"
                             [product]="product"
                             [lookups]="vm.lookups">
            </tt-product-card>
          </div>

          <div class="more" *ngIf="vm.page.hasMore">
            <button type="button" class="tt-btn tt-btn--ghost" (click)="loadMore()">טעינת מוצרים נוספים</button>
          </div>
        </ng-container>
      </ng-template>

      <ng-template #loading><tt-skeleton-grid [count]="6"></tt-skeleton-grid></ng-template>
    </div>
  `,
  styles: [`
    .head { margin-block-end: var(--tt-space-5); }
    .head h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .filters {
      display: grid;
      gap: var(--tt-space-3);
      align-items: end;
      margin-block-end: var(--tt-space-5);
    }
    .grow { grid-column: 1 / -1; }

    .refine { grid-column: 1 / -1; }
    .refine > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-2);
      min-block-size: 44px;
      padding-inline: var(--tt-space-1);
      cursor: pointer;
      font-weight: 600;
      font-size: var(--tt-text-sm);
      color: var(--tt-text-muted);
      list-style: none;
    }
    .refine > summary::-webkit-details-marker { display: none; }
    .refine__sign {
      position: relative;
      inline-size: 12px;
      block-size: 12px;
      color: var(--tt-brand-400);
    }
    .refine__sign::before, .refine__sign::after {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inline-size: 12px;
      block-size: 2px;
      background: currentColor;
      transform: translateY(-50%);
      transition: opacity var(--tt-duration-fast) var(--tt-ease);
    }
    .refine__sign::after { transform: translateY(-50%) rotate(90deg); }
    .refine[open] .refine__sign::after { opacity: 0; }

    .refine__body {
      display: grid;
      gap: var(--tt-space-3);
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      padding-block-start: var(--tt-space-3);
    }
    .count { margin-block-end: var(--tt-space-3); }
    /* One skeleton row's worth of space, so the first response does not jump. */
    .tt-grid { min-block-size: 260px; }
    .more { display: flex; justify-content: center; margin-block-start: var(--tt-space-5); }
    @media (max-width: 719px) {
      .head h1 { font-size: var(--tt-text-2xl); }
    }

    /* Above the phone breakpoint the disclosure is not wanted: the selects are
       always shown and the summary is hidden. The UA hides a closed details'
       contents, so this rule has to be specific enough to win. */
    @media (min-width: 720px) {
      .refine > summary { display: none; }
      .refine__body { grid-template-columns: repeat(4, 1fr); padding-block-start: 0; }
    }
  `],
})
export class StorePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);

  private readonly querySubject = new BehaviorSubject<CatalogQuery>({
    sort: 'relevance',
    page: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  });

  private pageSize = DEFAULT_PAGE_SIZE;

  readonly error = signal<AppError | undefined>(undefined);

  readonly lookups$ = this.catalog.lookups$;
  readonly search$ = this.querySubject.pipe(map((query) => query.search ?? ''));

  readonly productTypes: readonly { value: ProductType; label: string }[] = [
    { value: ProductType.GameCurrency, label: 'מטבעות משחק' },
    { value: ProductType.DigitalCode, label: 'קוד דיגיטלי' },
    { value: ProductType.GiftCard, label: 'כרטיס מתנה' },
    { value: ProductType.Subscription, label: 'מנוי' },
    { value: ProductType.PlayerService, label: 'שירות שחקן' },
  ];

  /**
   * One stream drives the grid: query changes are debounced, the request is
   * switched, and the template consumes it through `async` — no manual
   * subscriptions and nothing to unsubscribe.
   */
  readonly vm$: Observable<StoreViewModel> = combineLatest([
    this.querySubject.pipe(debounceTime(200), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))),
    this.lookups$,
  ]).pipe(
    switchMap(([query, lookups]) => this.catalog.search(query).pipe(
      map((page): StoreViewModel => ({ page, lookups })),
    )),
    catchError((error: unknown) => {
      this.error.set(toAppError(error));
      return EMPTY;
    }),
    // Emitting undefined first keeps the skeleton on screen until data arrives.
    startWith(undefined as unknown as StoreViewModel),
  );

  /**
   * Whether the filter panel is expanded.
   *
   * Open by default on a wide screen and closed on a phone, where five selects
   * would otherwise fill the entire first screen and push every product below
   * the fold. Bound to the `open` attribute rather than styled open, because
   * the browser hides a closed `details` body with `content-visibility` and a
   * CSS override cannot reveal it.
   */
  readonly filtersOpen = signal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 720px)').matches,
  );

  onFiltersToggle(event: Event): void {
    this.filtersOpen.set((event.target as HTMLDetailsElement).open);
  }

  constructor() {
    const params = this.route.snapshot.queryParamMap;

    // The storefront sells one game, so every query is scoped to it. Doing this
    // here rather than in the facade keeps the catalog service general: the
    // platform still handles many games, this shop presents one.
    this.catalog.gameBySlug(STOREFRONT.focusGameSlug).subscribe((game) => {
      this.patch({ gameIds: [game.id] });
    });

    // The header search navigates here with `?search=`. Without this the box
    // would appear to work and quietly return the whole catalogue.
    const search = params.get('search');
    if (search) {
      this.patch({ search });
    }
    this.analytics.pageView('/store', 'Store');
  }

  get gameId(): string { return this.querySubject.value.gameIds?.[0] ?? ''; }
  get platformId(): string { return this.querySubject.value.platformIds?.[0] ?? ''; }
  get regionId(): string { return this.querySubject.value.regionIds?.[0] ?? ''; }
  get type(): string { return this.querySubject.value.types?.[0] ?? ''; }
  get sort(): CatalogSort { return this.querySubject.value.sort ?? 'relevance'; }

  get hasFilters(): boolean {
    const query = this.querySubject.value;
    return Boolean(query.search || query.gameIds?.length || query.platformIds?.length
      || query.regionIds?.length || query.types?.length);
  }

  platforms(lookups: CatalogLookups | null): readonly Platform[] {
    return lookups ? [...lookups.platforms.values()] : [];
  }

  regions(lookups: CatalogLookups | null): readonly Region[] {
    return lookups ? [...lookups.regions.values()] : [];
  }

  setSearch(value: string): void { this.patch({ search: value || undefined }); }
  setGame(value: string): void { this.patch({ gameIds: value ? [value] : undefined }); }
  setPlatform(value: string): void { this.patch({ platformIds: value ? [value] : undefined }); }
  setRegion(value: string): void { this.patch({ regionIds: value ? [value] : undefined }); }
  setType(value: string): void { this.patch({ types: value ? [value as ProductType] : undefined }); }
  setSort(value: CatalogSort): void { this.patch({ sort: value }); }

  loadMore(): void {
    this.pageSize += DEFAULT_PAGE_SIZE;
    this.patch({});
  }

  clear(): void {
    this.pageSize = DEFAULT_PAGE_SIZE;
    this.querySubject.next({ sort: 'relevance', page: { page: 1, pageSize: this.pageSize } });
  }

  retry(): void {
    this.error.set(undefined);
    this.patch({});
  }

  trackById(_index: number, product: Product): string {
    return product.id;
  }

  private patch(partial: Partial<CatalogQuery>): void {
    this.querySubject.next({
      ...this.querySubject.value,
      ...partial,
      page: { page: 1, pageSize: this.pageSize },
    });
  }
}
