// Player interface represents a FIFA player card
export interface Player {
  id: string;
  name: string;
  position: string;
  club: string;
  rating: number;
  imageUrl: string;
  price: number;
  game: string; // e.g. 'FIFA'
}

// TokenPackage interface represents a purchasable token bundle (new package-based flow)
export interface TokenPackage {
  id: string;
  name: string;
  amount: number;
  price: number;
  imageUrl: string;
  description: string;
  platform: string;
}

// CartItem interface represents an item in the shopping cart
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  platform: string;
  productType: 'tokenPackage';
}

// Order interface represents a completed or pending order
export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

// PaymentPayload interface for payment processing
export interface PaymentPayload {
  userId: string;
  orderId: string;
  paymentMethod: 'creditCard' | 'paypal' | 'digitalWallet';
  amount: number;
  paymentDetails: {
    cardNumber?: string;
    expiryDate?: string;
    cvv?: string;
    paypalEmail?: string;
    walletAddress?: string;
  };
}

// PaymentResult interface for payment response
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message: string;
} 