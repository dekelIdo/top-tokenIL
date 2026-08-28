import { IsoDateTime, LocalizedText, OrderId, SupportTicketId } from '../common';

export enum SupportTopic {
  OrderStatus = 'ORDER_STATUS',
  DeliveryProblem = 'DELIVERY_PROBLEM',
  PaymentProblem = 'PAYMENT_PROBLEM',
  RefundRequest = 'REFUND_REQUEST',
  RegionProblem = 'REGION_PROBLEM',
  General = 'GENERAL',
}

export enum SupportTicketStatus {
  Open = 'OPEN',
  InProgress = 'IN_PROGRESS',
  WaitingForCustomer = 'WAITING_FOR_CUSTOMER',
  Resolved = 'RESOLVED',
  Closed = 'CLOSED',
}

export interface SupportTicket {
  readonly id: SupportTicketId;
  readonly reference: string;
  readonly topic: SupportTopic;
  readonly status: SupportTicketStatus;
  readonly orderId?: OrderId;
  readonly contactEmail: string;
  readonly subject: string;
  readonly message: string;
  readonly createdAt: IsoDateTime;
}

export interface CreateSupportTicketRequest {
  readonly topic: SupportTopic;
  readonly contactEmail: string;
  readonly subject: string;
  readonly message: string;
  readonly orderReference?: string;
}

export interface FaqEntry {
  readonly id: string;
  readonly question: LocalizedText;
  readonly answer: LocalizedText;
  readonly topic: SupportTopic;
}
