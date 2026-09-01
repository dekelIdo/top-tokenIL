import { ErrorHandler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { PreloadAllModules, provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';

import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { GlobalErrorHandler } from './app/core/error';
import { provideDataLayer } from './app/data';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      APP_ROUTES,
      // Lazy routes are preloaded in the background: the store is small enough
      // that the first navigation after landing should feel instant.
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    provideDataLayer(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
}).catch((error: unknown) => {
  console.error('[easycoins] bootstrap failed', error);
});
