import { Observable } from 'rxjs';
import { Fulfillment, FulfillmentDescriptor, FulfillmentMethod, OrderId } from '../../domain';

export abstract class FulfillmentApiService {
  /** Customer-facing copy and honest ETAs for each delivery method. */
  abstract getDescriptors(): Observable<readonly FulfillmentDescriptor[]>;
  abstract getDescriptor(method: FulfillmentMethod): Observable<FulfillmentDescriptor>;
  abstract getFulfillments(orderId: OrderId): Observable<readonly Fulfillment[]>;
}
