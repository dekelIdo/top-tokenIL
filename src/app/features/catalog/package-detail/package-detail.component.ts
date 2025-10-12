import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TokenService } from '../../../core/token.service';
import { CartService } from '../../../core/cart.service';
import { TokenPackage, CartItem } from '../../../core/models';
import { Subject, of, Observable } from 'rxjs';
import { takeUntil, catchError, finalize, switchMap, tap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-package-detail',
  templateUrl: './package-detail.component.html',
  styleUrls: ['./package-detail.component.scss'],
  animations: [
    trigger('pageAnimation', [
      transition(':enter', [
        query('.hero-section, .package-info, .action-buttons', [
          style({ opacity: 0, transform: 'translateY(30px)' }),
          stagger(100, [
            animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('imageAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('800ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class PackageDetailComponent implements OnInit, OnDestroy {
  package: TokenPackage | null = null;
  loading = true;
  error = false;
  addingToCart = false;
  quantity = 1;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tokenService: TokenService,
    private cartService: CartService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadPackage();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadPackage() {
    console.log('PackageDetailComponent: Starting to load package');
    this.loading = true;
    this.error = false;

    this.route.params.pipe(
      takeUntil(this.destroy$),
      switchMap(params => {
        const id = params['id'];
        console.log('PackageDetailComponent: Package ID from params:', id);
        return this.tokenService.getPackageById(id);
      }),
      catchError(error => {
        console.error('PackageDetailComponent: Error loading package:', error);
        this.error = true;
        this.loading = false;
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe(pkg => {
      console.log('PackageDetailComponent: Received package:', pkg);
      if (pkg) {
        this.package = pkg;
        console.log('PackageDetailComponent: Package set successfully');
      } else {
        this.error = true;
        console.log('PackageDetailComponent: Package not found');
      }
    });
  }

  onQuantityChange(change: number) {
    const newQuantity = this.quantity + change;
    if (newQuantity >= 1 && newQuantity <= 10) {
      this.quantity = newQuantity;
    }
  }

  addToCart() {
    if (!this.package) return;

    console.log('PackageDetailComponent: Adding to cart:', this.package.name, 'quantity:', this.quantity);
    this.addingToCart = true;
    
    // Simulate API call
    setTimeout(() => {
      const cartItem: CartItem = {
        id: this.package!.id,
        name: this.package!.name,
        price: this.package!.price,
        quantity: this.quantity,
        imageUrl: this.package!.imageUrl,
        platform: this.package!.platform,
        productType: 'tokenPackage'
      };

      this.cartService.addToCart(cartItem);
      
      this.snackBar.open(`${this.quantity}x ${this.package!.name} added to cart!`, 'View Cart', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });

      this.addingToCart = false;
      this.cdr.detectChanges();
    }, 500);
  }

  buyNow() {
    if (!this.package) return;

    console.log('PackageDetailComponent: Buy now for package:', this.package.name, 'quantity:', this.quantity);
    // Add to cart first
    const cartItem: CartItem = {
      id: this.package.id,
      name: this.package.name,
      price: this.package.price,
      quantity: this.quantity,
      imageUrl: this.package.imageUrl,
      platform: this.package.platform,
      productType: 'tokenPackage'
    };

    this.cartService.addToCart(cartItem);
    this.router.navigate(['/checkout']).catch(error => {
      console.error('Navigation error:', error);
      this.snackBar.open('שגיאה בניווט לתשלום. אנא נסה שוב.', 'סגור', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    });
  }

  onBack() {
    this.router.navigate(['/catalog']).catch(error => {
      console.error('Navigation error:', error);
      this.snackBar.open('שגיאה בניווט. אנא נסה שוב.', 'סגור', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    });
  }

  formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K`;
    }
    return amount.toString();
  }

  getTotalPrice(): number {
    return this.package ? this.package.price * this.quantity : 0;
  }

  onRetry() {
    this.loadPackage();
  }
} 