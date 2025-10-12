import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { TokenService } from '../../core/token.service';
import { TokenPackage } from '../../core/models';
import { Router } from '@angular/router';
import { Subject, Observable, combineLatest, of } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, catchError, finalize } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { trigger, transition, style, animate, stagger } from '@angular/animations';

@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.scss'],
  animations: [
    trigger('packageAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class CatalogComponent implements OnInit, OnDestroy {
  packages: TokenPackage[] = [];
  filteredPackages: TokenPackage[] = [];
  search = '';
  sort = 'price-asc';
  platform = '';
  amountRange = '';
  platforms: string[] = [];
  loading = true;
  error = false;
  searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // Animation states
  showFilters = true;
  showPackages = false;

  constructor(
    private tokenService: TokenService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    // Debounced search
    this.searchSubject.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  ngOnInit() {
    this.loadPackages();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByPackage(index: number, pkg: TokenPackage): string {
    return pkg.id;
  }

  private loadPackages() {
    console.log('CatalogComponent: Starting to load packages');
    this.loading = true;
    this.error = false;
    
    this.tokenService.getPackages().pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('CatalogComponent: Error loading packages:', error);
        this.error = true;
        return of([]);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe((packages: TokenPackage[]) => {
      console.log('CatalogComponent: Received packages:', packages);
      this.packages = packages;
      this.platforms = Array.from(new Set(packages.map(pkg => pkg.platform)));
      this.applyFilters();
      
      // Animate in packages
      setTimeout(() => {
        this.showPackages = true;
        this.cdr.detectChanges();
      }, 100);
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.search);
  }

  applyFilters() {
    let result = [...this.packages];
    
    // Search filter
    if (this.search.trim()) {
      const searchTerm = this.search.toLowerCase().trim();
      result = result.filter(pkg => 
        pkg.name.toLowerCase().includes(searchTerm) ||
        pkg.description.toLowerCase().includes(searchTerm) ||
        pkg.platform.toLowerCase().includes(searchTerm)
      );
    }

    // Platform filter
    if (this.platform) {
      result = result.filter(pkg => pkg.platform === this.platform);
    }

    // Amount range filter
    if (this.amountRange) {
      switch (this.amountRange) {
        case '0-250k':
          result = result.filter(pkg => pkg.amount <= 250000);
          break;
        case '250k-1m':
          result = result.filter(pkg => pkg.amount > 250000 && pkg.amount <= 1000000);
          break;
        case '1m+':
          result = result.filter(pkg => pkg.amount > 1000000);
          break;
      }
    }

    // Sort
    result.sort((a, b) => {
      switch (this.sort) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'amount-desc':
          return b.amount - a.amount;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    this.filteredPackages = result;
  }

  onBuyNow(pkg: TokenPackage) {
    console.log('CatalogComponent: onBuyNow called with package:', pkg);
    this.router.navigate(['/catalog/package', pkg.id]);
  }

  onRetry() {
    this.loadPackages();
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  clearFilters() {
    this.search = '';
    this.platform = '';
    this.amountRange = '';
    this.sort = 'price-asc';
    this.applyFilters();
  }

  getFilterCount(): number {
    let count = 0;
    if (this.search.trim()) count++;
    if (this.platform) count++;
    if (this.amountRange) count++;
    if (this.sort !== 'price-asc') count++;
    return count;
  }

  formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K`;
    }
    return amount.toString();
  }
}
