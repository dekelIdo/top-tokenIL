import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  AuthState, CreateSupportTicketRequest, Customer, FaqEntry, Page, PageRequest, ProductId,
  Promotion, Review, ReviewSummary, SupportTicket,
} from '../../domain';
import {
  AuthMethods, CustomerApiService, PromotionApiService, ReviewApiService, SupportApiService,
} from '../api';
import { ApiClient } from './api-client.service';
import * as Dto from './dto';
import * as Map from './mappers';

@Injectable()
export class HttpPromotionApiService extends PromotionApiService {
  private readonly api = inject(ApiClient);

  getActivePromotions(): Observable<readonly Promotion[]> {
    return this.api.get<Dto.PromotionDto[]>('/promotions').pipe(map((dtos) => dtos.map(Map.toPromotion)));
  }
}

@Injectable()
export class HttpReviewApiService extends ReviewApiService {
  private readonly api = inject(ApiClient);

  getReviews(page: PageRequest, productId?: ProductId): Observable<Page<Review>> {
    return this.api.get<Dto.PageDto<Dto.ReviewDto>>('/reviews', {
      params: { page: page.page, pageSize: page.pageSize, productId },
    }).pipe(map((dto) => Map.toPage(dto, Map.toReview)));
  }

  getSummary(productId?: ProductId): Observable<ReviewSummary> {
    return this.api.get<Dto.ReviewSummaryDto>('/reviews/summary', { params: { productId } })
      .pipe(map(Map.toReviewSummary));
  }
}

@Injectable()
export class HttpSupportApiService extends SupportApiService {
  private readonly api = inject(ApiClient);

  getFaq(): Observable<readonly FaqEntry[]> {
    return this.api.get<Dto.FaqEntryDto[]>('/faq').pipe(map((dtos) => dtos.map(Map.toFaqEntry)));
  }

  createTicket(request: CreateSupportTicketRequest): Observable<SupportTicket> {
    return this.api.post<Dto.SupportTicketDto>('/support/tickets', request).pipe(map(Map.toSupportTicket));
  }
}

/**
 * Customer and session over HTTP.
 *
 * The session is an httpOnly cookie issued by the verify-code endpoint. This
 * client never sees, stores or transmits a token, so `getAuthState` asks the
 * server who the caller is instead of decoding anything locally.
 */
@Injectable()
export class HttpCustomerApiService extends CustomerApiService {
  private readonly api = inject(ApiClient);

  getAuthState(): Observable<AuthState> {
    return this.api.get<Dto.MeDto>('/me').pipe(map(Map.toAuthState));
  }

  getAuthMethods(): Observable<AuthMethods> {
    return this.api.get<AuthMethods>('/auth/methods');
  }

  register(email: string, password: string): Observable<void> {
    return this.api.post<void>('/auth/register', { email, password });
  }

  login(email: string, password: string): Observable<AuthState> {
    return this.api.post<Dto.MeDto>('/auth/login', { email, password }).pipe(map(Map.toAuthState));
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.api.post<void>('/auth/password/forgot', { email });
  }

  resetPassword(token: string, password: string): Observable<AuthState> {
    return this.api.post<Dto.MeDto>('/auth/password/reset', { token, password })
      .pipe(map(Map.toAuthState));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.api.post<void>('/auth/password/change', { currentPassword, newPassword });
  }

  requestEmailSignIn(email: string): Observable<void> {
    return this.api.post<void>('/auth/request-code', { email });
  }

  requestAccountDeletion(): Observable<void> {
    return this.api.post<void>('/account/delete', {});
  }

  updateProfile(
    patch: Partial<Pick<Customer, 'displayName' | 'phone' | 'preferredLocale' | 'preferredRegion'>>,
  ): Observable<Customer> {
    return this.api.patch<Dto.CustomerDto>('/me', patch).pipe(map(Map.toCustomer));
  }

  signOut(): Observable<void> {
    return this.api.post<void>('/auth/logout', {});
  }
}
