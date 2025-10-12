import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CatalogComponent } from './catalog.component';
import { PackageDetailComponent } from './package-detail/package-detail.component';

const routes: Routes = [
  { path: '', component: CatalogComponent },
  { path: 'package/:id', component: PackageDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CatalogRoutingModule { }
