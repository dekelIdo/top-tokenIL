import { Routes } from '@angular/router';

import { cartNotEmptyGuard } from './pages/checkout/cart-not-empty.guard';
import { LEGAL_PAGES } from './pages/legal/legal.content';

/**
 * Commerce routing map.
 *
 * Every route below renders a real page — there are no placeholders and no
 * redirects to a "coming soon" screen. Each page is lazy-loaded as a standalone
 * component, so the initial bundle carries the shell only.
 */
export const APP_ROUTES: Routes = [
  {
    path: '',
    title: 'Top Token | מוצרי גיימינג דיגיטליים',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'store',
    title: 'החנות | Top Token',
    loadComponent: () => import('./pages/store/store.page').then((m) => m.StorePage),
  },
  // /products is the canonical catalog path in the API; in the UI it is the store.
  { path: 'products', pathMatch: 'full', redirectTo: 'store' },
  {
    path: 'games',
    title: 'משחקים | Top Token',
    loadComponent: () => import('./pages/games/games.page').then((m) => m.GamesPage),
  },
  {
    path: 'games/:gameSlug',
    loadComponent: () => import('./pages/games/game-detail.page').then((m) => m.GameDetailPage),
  },
  {
    path: 'products/:productSlug',
    loadComponent: () => import('./pages/product/product-detail.page').then((m) => m.ProductDetailPage),
  },
  {
    // Deep link straight to a variant, e.g. a "1M coins" ad landing page.
    path: 'products/:productSlug/:variantId',
    loadComponent: () => import('./pages/product/product-detail.page').then((m) => m.ProductDetailPage),
  },
  {
    path: 'cart',
    title: 'העגלה שלי | Top Token',
    loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'checkout',
    title: 'תשלום | Top Token',
    canActivate: [cartNotEmptyGuard],
    loadComponent: () => import('./pages/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: 'order/:orderId',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'order/:orderId/success',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
    data: { celebrate: true },
  },
  {
    path: 'order/:orderId/status',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'account',
    title: 'האזור האישי | Top Token',
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'account/orders',
    title: 'ההזמנות שלי | Top Token',
    loadComponent: () => import('./pages/account/account-orders.page').then((m) => m.AccountOrdersPage),
  },
  {
    path: 'account/order/:orderId',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'support',
    title: 'תמיכה | Top Token',
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  {
    path: 'faq',
    title: 'שאלות נפוצות | Top Token',
    loadComponent: () => import('./pages/support/faq.page').then((m) => m.FaqPage),
  },
  {
    path: 'reviews',
    title: 'ביקורות | Top Token',
    loadComponent: () => import('./pages/reviews/reviews.page').then((m) => m.ReviewsPage),
  },
  {
    path: 'deals',
    title: 'מבצעים | Top Token',
    loadComponent: () => import('./pages/deals/deals.page').then((m) => m.DealsPage),
  },
  {
    path: 'contact',
    title: 'צור קשר | Top Token',
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  // Static policy pages share one component and differ only by content record.
  ...LEGAL_PAGES.map((page) => ({
    path: page.slug,
    title: `${page.title} | Top Token`,
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
    data: { slug: page.slug },
  })),
  {
    path: '**',
    title: 'הדף לא נמצא | Top Token',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
