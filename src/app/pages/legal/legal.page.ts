import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { LegalPageContent, findLegalPage } from './legal.content';

/**
 * One component renders every policy page; the route supplies the slug. Adding a
 * policy is a content edit plus a route entry, not a new component.
 */
@Component({
  selector: 'tt-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section" *ngIf="content; else missing">
      <h1>{{ content.title }}</h1>
      <p class="lead tt-muted">{{ content.intro }}</p>

      <section *ngFor="let section of content.sections">
        <h2>{{ section.heading }}</h2>
        <p *ngFor="let paragraph of section.paragraphs">{{ paragraph }}</p>
      </section>

      <!-- Stated on the page rather than only in a document, so nobody reads
           this as finished policy. -->
      <div class="tt-alert tt-alert--warning">
        <p class="review">
          המסמך הזה הוא טיוטה של צוות הפיתוח וטרם עבר בדיקה משפטית. יש להשלים בדיקה כזו לפני שהחנות תקבל תשלומים אמיתיים.
        </p>

        <ng-container *ngIf="content.awaitingFromOwner?.length">
          <p class="review review--head">פרטים שחסרים ונדרשים מבעלי העסק:</p>
          <ul class="pending">
            <li *ngFor="let item of content.awaitingFromOwner">{{ item }}</li>
          </ul>
        </ng-container>
      </div>
    </div>

    <ng-template #missing>
      <div class="tt-container tt-section">
        <h1>הדף לא נמצא</h1>
        <p class="tt-muted">אפשר לחזור <a routerLink="/">לעמוד הבית</a>.</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .tt-container { max-inline-size: 760px; }
    .lead { font-size: var(--tt-text-lg); }
    .review { margin: 0; }
    .review--head { margin-block-start: var(--tt-space-3); font-weight: 700; }
    .pending { margin: var(--tt-space-2) 0 0; padding-inline-start: var(--tt-space-5); }
    .pending li { margin-block-end: var(--tt-space-1); }
    section { margin-block-start: var(--tt-space-6); }
    h2 { font-size: var(--tt-text-lg); }
  `],
})
export class LegalPage {
  private readonly route = inject(ActivatedRoute);

  readonly content: LegalPageContent | undefined = findLegalPage(
    String(this.route.snapshot.data['slug'] ?? ''),
  );
}
