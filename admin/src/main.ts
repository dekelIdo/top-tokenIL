import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

/**
 * The operator panel.
 *
 * A separate application from the storefront on purpose: none of this code is
 * shipped to a customer's browser, and the panel can be put behind whatever
 * network restriction the host offers without affecting the shop.
 */
bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient()],
}).catch((error) => console.error(error));
