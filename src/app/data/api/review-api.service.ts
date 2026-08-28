import { Observable } from 'rxjs';
import { Page, PageRequest, ProductId, Review, ReviewSummary } from '../../domain';

export abstract class ReviewApiService {
  abstract getReviews(page: PageRequest, productId?: ProductId): Observable<Page<Review>>;
  abstract getSummary(productId?: ProductId): Observable<ReviewSummary>;
}
