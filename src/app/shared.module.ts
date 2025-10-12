// SharedModule: Reusable UI components, pipes, and directives used across the app.
// Import this module in feature modules as needed.
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TokenCardComponent } from './shared/token-card/token-card.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { HeaderComponent } from './shared/header/header.component';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBarModule } from '@angular/material/snack-bar';

@NgModule({
  declarations: [TokenCardComponent, HeaderComponent],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    MatBadgeModule,
    MatSnackBarModule
  ],
  exports: [
    TokenCardComponent,
    HeaderComponent,
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    MatBadgeModule,
    MatSnackBarModule
  ]
})
export class SharedModule { }
