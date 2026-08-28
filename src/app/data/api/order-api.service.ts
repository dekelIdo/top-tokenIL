import { Observable } from 'rxjs';
import { CheckoutSessionId, Order, OrderId, OrderStatusSnapshot } from '../../domain';

export abstract class OrderApiService {
  abstract createFromCheckout(sessionId: CheckoutSessionId): Observable<Order>;
  abstract getOrder(orderId: OrderId): Observable<Order>;
  abstract getOrderStatus(orderId: OrderId): Observable<OrderStatusSnapshot>;
  abstract listOrders(): Observable<readonly Order[]>;
}
