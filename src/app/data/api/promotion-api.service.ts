import { Observable } from 'rxjs';
import { Promotion } from '../../domain';

export abstract class PromotionApiService {
  abstract getActivePromotions(): Observable<readonly Promotion[]>;
}
