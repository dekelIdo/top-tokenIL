import { Observable } from 'rxjs';
import { CreateSupportTicketRequest, FaqEntry, SupportTicket } from '../../domain';

export abstract class SupportApiService {
  abstract getFaq(): Observable<readonly FaqEntry[]>;
  abstract createTicket(request: CreateSupportTicketRequest): Observable<SupportTicket>;
}
