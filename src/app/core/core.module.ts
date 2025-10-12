// CoreModule: Singleton services (AuthService, TokenService, PaymentService, CartService) and core logic for the app.
// Only import this module in AppModule.
import { NgModule, Optional, SkipSelf } from '@angular/core';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CartService } from './cart.service';
import { PaymentService } from './payment.service';

@NgModule({
  providers: [AuthService, TokenService, CartService, PaymentService]
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it in the AppModule only.');
    }
  }
} 