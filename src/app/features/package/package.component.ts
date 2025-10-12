import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TokenService } from '../../core/token.service';
import { TokenPackage } from '../../core/models';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-package',
  templateUrl: './package.component.html',
  styleUrls: ['./package.component.scss']
})
export class PackageComponent implements OnInit {
  pkg: TokenPackage | null = null;
  loading = true;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private tokenService: TokenService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.tokenService.getPackageById(id).subscribe(pkg => {
        this.pkg = pkg || null;
        this.loading = false;
        if (!pkg) this.error = 'החבילה לא נמצאה.';
      }, () => {
        this.error = 'נכשל בטעינת החבילה.';
        this.loading = false;
      });
    } else {
      this.error = 'חבילה לא תקינה.';
      this.loading = false;
    }
  }

  continueToCheckout() {
    if (this.pkg) {
      this.router.navigate(['/checkout'], { state: { pkg: this.pkg } }).catch(error => {
        console.error('Navigation error:', error);
        this.snackBar.open('שגיאה בניווט לתשלום. אנא נסה שוב.', 'סגור', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      });
    }
  }
}
