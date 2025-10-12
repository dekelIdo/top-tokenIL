import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CoreModule } from './core.module';
import { SharedModule } from './shared.module';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule, // Enable animations
    AppRoutingModule,
    CoreModule, // Singleton services
    SharedModule, // Shared UI components
    HttpClientModule, // Enable HTTP requests
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
