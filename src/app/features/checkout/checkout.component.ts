import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CartService } from '../../core/cart.service';
import { PaymentService } from '../../core/payment.service';
import { CartItem } from '../../core/models';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  loading = false;
  error = '';
  cart: CartItem[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private cartService: CartService,
    private paymentService: PaymentService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadCart();
    this.initForm();
    
    // Redirect if cart is empty
    if (this.cart.length === 0) {
      this.router.navigate(['/catalog']).catch(error => {
        console.error('Navigation error:', error);
      });
      return;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCart() {
    this.cart = this.cartService.getCart();
    console.log('CheckoutComponent: Loaded cart:', this.cart);
  }

  private initForm() {
    this.form = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      psnId: ['', Validators.required],
      phone: [''],
      terms: [false, Validators.requiredTrue]
    });
  }

  get total(): number {
    return this.cartService.getCartTotal();
  }

  get itemCount(): number {
    return this.cartService.getCartItemCount();
  }

  updateQuantity(itemId: string, quantity: number) {
    console.log('CheckoutComponent: Updating quantity for item:', itemId, 'to:', quantity);
    this.cartService.updateQuantity(itemId, quantity);
    this.loadCart();
  }

  removeItem(itemId: string) {
    console.log('CheckoutComponent: Removing item:', itemId);
    this.cartService.removeFromCart(itemId);
    this.loadCart();
    
    // Redirect if cart becomes empty
    if (this.cart.length === 0) {
      this.router.navigate(['/catalog']);
    }
  }

  pay() {
    console.log('CheckoutComponent: Starting payment process');
    if (this.form.invalid) {
      console.log('CheckoutComponent: Form is invalid');
      this.form.markAllAsTouched();
      return;
    }

    if (this.cart.length === 0) {
      console.log('CheckoutComponent: Cart is empty');
      this.error = 'העגלה ריקה. אנא הוסף פריטים לפני המשך.';
      return;
    }

    this.loading = true;
    this.error = '';
    console.log('CheckoutComponent: Processing payment for amount:', this.total);

    this.paymentService.processPayment({
      userId: this.form.value.psnId,
      orderId: Math.random().toString(36).substr(2, 8),
      paymentMethod: 'creditCard', // Simulated
      amount: this.total,
      paymentDetails: {}
    }).subscribe(result => {
      this.loading = false;
      console.log('CheckoutComponent: Payment result:', result);
      if (result.success) {
        this.cartService.clearCart();
        this.router.navigate(['/order-confirmation'], {
          state: {
            name: this.form.value.name,
            transactionId: result.transactionId,
            items: this.cart,
            total: this.total
          }
        }).catch(error => {
          console.error('Navigation error:', error);
          this.snackBar.open('התשלום הושלם אך יש בעיה בניווט. אנא נסה שוב.', 'סגור', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        });
      } else {
        this.error = result.message;
      }
    }, () => {
      this.loading = false;
      this.error = 'התשלום נכשל. אנא נסה שוב.';
    });
  }

  goBack() {
    this.router.navigate(['/cart']).catch(error => {
      console.error('Navigation error:', error);
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
}
