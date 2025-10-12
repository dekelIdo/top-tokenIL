import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CartItem } from './models';

/**
 * CartService: Manages the shopping cart, including add/remove/update items, and persists cart state in localStorage.
 * Singleton service provided in CoreModule.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly CART_KEY = 'topTokenCart';
  private cartSubject = new BehaviorSubject<CartItem[]>([]);
  cart$ = this.cartSubject.asObservable();

  constructor() {
    this.loadCart();
  }

  private saveCart(cart: CartItem[]) {
    try {
      localStorage.setItem(this.CART_KEY, JSON.stringify(cart));
      this.cartSubject.next(cart);
      console.log('CartService: Cart saved successfully:', cart);
    } catch (error) {
      console.error('CartService: Error saving cart to localStorage:', error);
    }
  }

  private loadCart() {
    try {
      const data = localStorage.getItem(this.CART_KEY);
      const cart = data ? JSON.parse(data) : [];
      this.cartSubject.next(cart);
      console.log('CartService: Cart loaded from localStorage:', cart);
    } catch (error) {
      console.error('CartService: Error loading cart from localStorage:', error);
      this.cartSubject.next([]);
    }
  }

  addToCart(item: CartItem) {
    try {
      const cart = [...this.cartSubject.value];
      const existingItem = cart.find(i => i.id === item.id);
      if (existingItem) {
        existingItem.quantity += item.quantity;
      } else {
        cart.push(item);
      }
      this.saveCart(cart);
      console.log('CartService: Item added to cart:', item);
    } catch (error) {
      console.error('CartService: Error adding item to cart:', error);
    }
  }

  getCart(): CartItem[] {
    return this.cartSubject.value;
  }

  removeFromCart(itemId: string) {
    try {
      const cart = this.cartSubject.value.filter(item => item.id !== itemId);
      this.saveCart(cart);
      console.log('CartService: Item removed from cart:', itemId);
    } catch (error) {
      console.error('CartService: Error removing item from cart:', error);
    }
  }

  updateQuantity(itemId: string, quantity: number) {
    try {
      const cart = [...this.cartSubject.value];
      const item = cart.find(i => i.id === itemId);
      if (item) {
        if (quantity <= 0) {
          this.removeFromCart(itemId);
        } else {
          item.quantity = quantity;
          this.saveCart(cart);
        }
        console.log('CartService: Quantity updated for item:', itemId, 'to:', quantity);
      }
    } catch (error) {
      console.error('CartService: Error updating quantity:', error);
    }
  }

  clearCart() {
    try {
      this.saveCart([]);
      console.log('CartService: Cart cleared');
    } catch (error) {
      console.error('CartService: Error clearing cart:', error);
    }
  }

  getCartTotal(): number {
    try {
      return this.cartSubject.value.reduce((total, item) => total + (item.price * item.quantity), 0);
    } catch (error) {
      console.error('CartService: Error calculating cart total:', error);
      return 0;
    }
  }

  getCartItemCount(): number {
    try {
      return this.cartSubject.value.reduce((count, item) => count + item.quantity, 0);
    } catch (error) {
      console.error('CartService: Error calculating cart item count:', error);
      return 0;
    }
  }
} 