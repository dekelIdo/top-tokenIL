import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderConfirmationRoutingModule } from './order-confirmation-routing.module';
import { OrderConfirmationComponent } from './order-confirmation.component';
import { SharedModule } from '../../shared.module';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';

@NgModule({
  declarations: [
    OrderConfirmationComponent
  ],
  imports: [
    CommonModule,
    OrderConfirmationRoutingModule,
    SharedModule,
    MatCardModule,
    MatSnackBarModule
  ]
})
export class OrderConfirmationModule { }
