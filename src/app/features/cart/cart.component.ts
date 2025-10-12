import { Component, OnInit } from '@angular/core';
import { CartService } from '../../core/cart.service';
import { CartItem } from '../../core/models';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent implements OnInit {
  cart$!: Observable<CartItem[]>;

  constructor(public cartService: CartService, private router: Router, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.cart$ = this.cartService.cart$;
    console.log('CartComponent: Initialized with cart observable');
  }

  get total(): number {
    const total = this.cartService.getCartTotal();
    console.log('CartComponent: Cart total:', total);
    return total;
  }

  get itemCount(): number {
    const count = this.cartService.getCartItemCount();
    console.log('CartComponent: Cart item count:', count);
    return count;
  }

  updateQuantity(itemId: string, quantity: number) {
    console.log('CartComponent: Updating quantity for item:', itemId, 'to:', quantity);
    this.cartService.updateQuantity(itemId, quantity);
  }

  remove(itemId: string) {
    console.log('CartComponent: Removing item:', itemId);
    this.cartService.removeFromCart(itemId);
  }

  clear() {
    console.log('CartComponent: Clearing cart');
    this.cartService.clearCart();
  }

  proceedToCheckout() {
    this.cart$.subscribe(cart => {
      if (cart.length > 0) {
        this.router.navigate(['/checkout']).catch(error => {
          console.error('Navigation error:', error);
          this.snackBar.open('שגיאה בניווט לתשלום. אנא נסה שוב.', 'סגור', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        });
      }
    }).unsubscribe();
  }

  goToCatalog() {
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

  trackByItem(index: number, item: CartItem): string {
    return item.id;
  }
}
