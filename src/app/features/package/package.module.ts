import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PackageRoutingModule } from './package-routing.module';
import { PackageComponent } from './package.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';


@NgModule({
  declarations: [
    PackageComponent
  ],
  imports: [
    CommonModule,
    PackageRoutingModule,
    MatSnackBarModule
  ]
})
export class PackageModule { }
