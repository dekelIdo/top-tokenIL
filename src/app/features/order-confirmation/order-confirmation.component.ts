import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-order-confirmation',
  templateUrl: './order-confirmation.component.html',
  styleUrls: ['./order-confirmation.component.scss']
})
export class OrderConfirmationComponent implements OnInit {
  transactionId: any;
  name: any;
  items: any;
  total: any;

  constructor(private router: Router, private snackBar: MatSnackBar) {}

  ngOnInit() {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      const state = navigation.extras.state as any;
      this.name = state.name;
      this.transactionId = state.transactionId;
      this.items = state.items;
      this.total = state.total;
      console.log('OrderConfirmationComponent: Received order data:', state);
    } else {
      console.warn('OrderConfirmationComponent: No order data received');
      // Redirect to catalog if no order data
      this.router.navigate(['/catalog']).catch(error => {
        console.error('Navigation error:', error);
      });
    }
  }

  backToCatalog() {
    this.router.navigate(['/catalog']).catch(error => {
      console.error('Navigation error:', error);
      this.snackBar.open('שגיאה בניווט. אנא נסה שוב.', 'סגור', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    });
  }
}
