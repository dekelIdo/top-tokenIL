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

      <p class="tt-alert tt-alert--warning">
        המסמך הזה הוא טיוטה של צוות הפיתוח וטרם עבר בדיקה משפטית. יש להשלים בדיקה כזו לפני שהחנות תקבל תשלומים אמיתיים.
      </p>
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
