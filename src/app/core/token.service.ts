import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { TokenPackage } from './models';

/**
 * TokenService: Manages token packages for the new package-based flow.
 * Singleton service provided in CoreModule.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly packagesUrl = 'assets/mock-packages.json';

  constructor(private http: HttpClient) {}

  /**
   * Get all token packages from mock data.
   */
  getPackages(): Observable<TokenPackage[]> {
    console.log('TokenService: Loading packages from', this.packagesUrl);
    return this.http.get<TokenPackage[]>(this.packagesUrl).pipe(
      tap(packages => {
        console.log('TokenService: Loaded packages:', packages);
      }),
      catchError(error => {
        console.error('TokenService: Error loading packages:', error);
        return throwError(() => new Error('Failed to load packages'));
      })
    );
  }

  /**
   * Get a single token package by ID.
   */
  getPackageById(id: string): Observable<TokenPackage | undefined> {
    console.log('TokenService: Getting package by ID:', id);
    
    if (!id) {
      console.error('TokenService: Package ID is required');
      return throwError(() => new Error('Package ID is required'));
    }
    
    return this.getPackages().pipe(
      map(packages => {
        console.log('TokenService: Searching for package with ID:', id, 'in packages:', packages);
        const package_ = packages.find(pkg => pkg.id === id);
        if (!package_) {
          console.warn(`TokenService: Package with ID ${id} not found`);
          console.log('TokenService: Available package IDs:', packages.map(p => p.id));
        } else {
          console.log('TokenService: Found package:', package_);
        }
        return package_;
      }),
      catchError(error => {
        console.error('TokenService: Error loading package by ID:', error);
        return throwError(() => new Error('Failed to load package'));
      })
    );
  }
} 