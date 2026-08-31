import { Component, inject, signal } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AdminApi, QueueJob, Stats } from '../api/admin-api.service';
import { StatusPillComponent } from '../ui/status-pill.component';
import { MoneyPipe } from '../ui/money.pipe';

/**
 * The work queue and the numbers above it.
 *
 * Oldest first, because the customer who has waited longest is the one closest
 * to asking for their money back. Nothing polls on a timer: a queue that
 * reorders itself under an operator's cursor is worse than one they refresh.
 */
@Component({
  selector: 'admin-queue',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, NgClass, NgFor, NgIf, StatusPillComponent, MoneyPipe],
  template: `
    <section class="stats">
      <div class="card stat">
        <span class="muted">ממתין לטיפול</span>
        <strong>{{ stats()?.open ?? '—' }}</strong>
      </div>
      <div class="card stat">
        <span class="muted">ממתין ללקוח</span>
        <strong>{{ stats()?.waitingOnCustomer ?? '—' }}</strong>
      </div>
      <div class="card stat" [ngClass]="{ alert: (stats()?.overdue ?? 0) > 0 }">
        <span class="muted">באיחור</span>
        <strong>{{ stats()?.overdue ?? '—' }}</strong>
      </div>
      <div class="card stat" [ngClass]="{ alert: (stats()?.failed ?? 0) > 0 }">
        <span class="muted">נכשל</span>
        <strong>{{ stats()?.failed ?? '—' }}</strong>
      </div>
      <div class="card stat">
        <span class="muted">סופק היום</span>
        <strong>{{ stats()?.deliveredToday ?? '—' }}</strong>
      </div>
      <div class="card stat">
        <span class="muted">הכנסה היום</span>
        <strong>{{ stats()?.revenueTodayMinor ?? 0 | money: 'ILS' }}</strong>
      </div>
    </section>

    <section class="card filters">
      <label>
        סטטוס
        <select [(ngModel)]="status" (change)="load()">
          <option value="">פתוח (ברירת מחדל)</option>
          <option value="PENDING">ממתין</option>
          <option value="PROCESSING">בטיפול</option>
          <option value="WAITING_FOR_CUSTOMER">ממתין ללקוח</option>
          <option value="DELIVERED">סופק</option>
          <option value="FAILED">נכשל</option>
        </select>
      </label>

      <label>
        מספר הזמנה (מזהה)
        <input [(ngModel)]="orderId" (keyup.enter)="load()" placeholder="ord_…" />
      </label>

      <label class="check">
        <input type="checkbox" [(ngModel)]="unclaimed" (change)="load()" />
        רק לא משויכים
      </label>

      <button (click)="load()" [disabled]="busy()">
        {{ busy() ? 'טוען…' : 'רענון' }}
      </button>
    </section>

    <p class="error" *ngIf="error() as message">{{ message }}</p>

    <section class="card scroll-x">
      <table>
        <thead>
          <tr>
            <th>הזמנה</th>
            <th>מוצר</th>
            <th>סטטוס</th>
            <th>אופרטור</th>
            <th>סכום</th>
            <th>נפתח</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let job of jobs(); trackBy: byId">
              <td>
                <a [routerLink]="['/jobs', job.id]">{{ job.order.orderNumber }}</a>
                <div class="muted small">{{ job.order.contactEmail }}</div>
              </td>
              <td>
                {{ job.orderItem.displayName['he'] || job.orderItem.displayName['en'] }}
                <div class="muted small">× {{ job.orderItem.quantity }}</div>
              </td>
              <td><admin-status-pill [status]="job.status" /></td>
              <td>{{ job.operatorId ?? '—' }}</td>
              <td>{{ job.order.totalMinor | money: job.order.currency }}</td>
              <td class="muted small">{{ job.createdAt | date: 'dd/MM HH:mm' }}</td>
            <td><a [routerLink]="['/jobs', job.id]">פתח</a></td>
          </tr>
          <tr *ngIf="jobs().length === 0">
            <td colspan="7" class="muted empty">
              {{ busy() ? 'טוען…' : 'אין עבודות שמתאימות לסינון.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  `,
  styles: [
    `
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.7rem;
        margin-bottom: 1rem;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.7rem 0.9rem;
      }
      .stat span {
        font-size: 0.8rem;
      }
      .stat strong {
        font-size: 1.5rem;
        font-weight: 600;
      }
      .stat.alert strong {
        color: var(--danger);
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 0.9rem;
        margin-bottom: 1rem;
      }
      .filters label {
        margin: 0;
        min-width: 180px;
      }
      .filters label.check {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        min-width: auto;
        color: var(--text);
      }
      .filters label.check input {
        width: auto;
      }
      .small {
        font-size: 0.8rem;
      }
      .empty {
        text-align: center;
        padding: 2rem;
      }
    `,
  ],
})
export class QueuePage {
  private readonly api = inject(AdminApi);

  status = '';
  orderId = '';
  unclaimed = false;

  readonly jobs = signal<QueueJob[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly byId = (_: number, job: QueueJob) => job.id;

  constructor() {
    this.load();
  }

  load(): void {
    this.busy.set(true);
    this.error.set(null);

    this.api.stats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => undefined, // The queue itself reports failures; two banners help nobody.
    });

    this.api
      .queue({
        status: this.status || undefined,
        unclaimed: this.unclaimed || undefined,
        orderId: this.orderId.trim() || undefined,
      })
      .subscribe({
        next: (page) => {
          this.jobs.set(page.items);
          this.busy.set(false);
        },
        error: (error: Error) => {
          this.error.set(error.message);
          this.busy.set(false);
        },
      });
  }
}
