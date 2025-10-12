import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  constructor(public cartService: CartService, public router: Router, private snackBar: MatSnackBar) {}

  get cartCount(): number {
    const count = this.cartService.getCartItemCount();
    console.log('HeaderComponent: Cart count:', count);
    return count;
  }

  goToCart() {
    console.log('HeaderComponent: Navigating to cart');
    this.router.navigate(['/cart']).catch(error => {
      console.error('Navigation error:', error);
      this.snackBar.open('שגיאה בניווט לעגלה. אנא נסה שוב.', 'סגור', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    });
  }
  
  goToCatalog() {
    console.log('HeaderComponent: Navigating to catalog');
    this.router.navigate(['/catalog']).catch(error => {
      console.error('Navigation error:', error);
      this.snackBar.open('שגיאה בניווט לקטלוג. אנא נסה שוב.', 'סגור', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    });
  }
} 