/**
 * The transfer-market delivery calculation ("Buy the Player").
 *
 * Coins are moved without anyone logging into the customer's account. The
 * customer lists a cheap, common player card on the transfer market at an exact
 * Buy-It-Now price; our farm account searches that player within a narrow price
 * band, finds the one listing at that unusual price, and buys it. The card is
 * only a vehicle. **The price is the delivery amount.**
 *
 * SECURITY: this is the whole reason the storefront never asks for a password.
 * The alternative mechanism used across this market ("comfort trade") requires
 * the customer's email, password and 2FA backup codes. Nothing here needs them,
 * and `CheckoutFieldKey` makes it structurally impossible to collect them.
 *
 * Two facts about EA's transfer market drive every number below, and both are
 * game rules we do not control:
 *
 * 1. **The seller pays a 5% tax.** Listing at 1,000,000 credits the seller
 *    950,000. To deliver a round number the list price must be grossed up.
 * 2. **Buy-It-Now prices snap to an increment ladder.** A price off the ladder
 *    cannot be entered in the game at all, so a calculated price that ignores it
 *    produces an instruction the customer physically cannot follow.
 *
 * VERIFY BEFORE GOING LIVE: `MARKET_TAX_RATE`, `MAX_BIN_PRICE` and
 * `BIN_INCREMENTS` are EA's rules, not ours, and EA changes them between
 * titles. Confirm all three against the live game each season. A stale ladder
 * silently produces unfollowable instructions.
 */

/** EA's cut of every transfer-market sale. The seller receives the rest. */
export const MARKET_TAX_RATE = 0.05;

/** Highest Buy-It-Now price the game accepts on a single listing. */
export const MAX_BIN_PRICE = 15_000_000;

/** Lowest Buy-It-Now price the game accepts. */
export const MIN_BIN_PRICE = 200;

/**
 * The Buy-It-Now ladder: below `under`, prices snap to `step`.
 * Ordered ascending; the final entry is the open-ended top band.
 */
const BIN_INCREMENTS: readonly { readonly under: number; readonly step: number }[] = [
  { under: 1_000, step: 50 },
  { under: 10_000, step: 100 },
  { under: 50_000, step: 250 },
  { under: 100_000, step: 500 },
  { under: Number.POSITIVE_INFINITY, step: 1_000 },
];

/** The increment that applies at a given price. */
export function binStep(price: number): number {
  for (const band of BIN_INCREMENTS) {
    if (price < band.under) {
      return band.step;
    }
  }
  return BIN_INCREMENTS[BIN_INCREMENTS.length - 1].step;
}

/**
 * Rounds a price up onto the ladder.
 *
 * Rounding up can cross a band boundary and change the applicable step, so this
 * settles rather than rounding once: round, re-read the step, repeat until the
 * price is valid under its own band. The loop is bounded by the number of bands.
 */
export function roundUpToBin(price: number): number {
  let candidate = Math.max(MIN_BIN_PRICE, Math.ceil(price));

  for (let guard = 0; guard <= BIN_INCREMENTS.length; guard += 1) {
    const step = binStep(candidate);
    const snapped = Math.ceil(candidate / step) * step;

    if (snapped === candidate) {
      return candidate;
    }
    candidate = snapped;
  }

  return candidate;
}

/** Coins the seller actually receives from a listing at `binPrice`. */
export function netFromBin(binPrice: number): number {
  return Math.floor(binPrice * (1 - MARKET_TAX_RATE));
}

/** Largest net delivery a single listing can carry. */
export const MAX_NET_PER_TRADE = netFromBin(MAX_BIN_PRICE);

/** One listing the customer must create. */
export interface CoinTrade {
  /** 1-based, for display: "trade 2 of 3". */
  readonly sequence: number;
  /** The exact Buy-It-Now price to enter. Non-negotiable. */
  readonly binPrice: number;
  /** Coins the customer receives from this listing, after EA's tax. */
  readonly netCoins: number;
}

export interface CoinTradePlan {
  /** Coins the customer ordered. */
  readonly requestedCoins: number;
  /** Coins actually delivered. Never less than requested; rounding favours the customer. */
  readonly deliveredCoins: number;
  /** Coins our farm account pays out in total. This is the real cost of the order. */
  readonly grossCoinsSpent: number;
  /** Paid to EA as market tax. Cost of doing business, not profit. */
  readonly taxCoins: number;
  readonly trades: readonly CoinTrade[];
}

export class CoinTradePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoinTradePlanError';
  }
}

/**
 * Builds the listings needed to deliver `requestedCoins` net to the customer.
 *
 * Rounding always favours the customer: a price is rounded *up* onto the ladder,
 * so they receive at least what they ordered and usually a few coins more. The
 * alternative, rounding down, means under-delivering on a paid order, which is
 * a support ticket and a chargeback rather than a saved handful of coins.
 *
 * Orders larger than one listing can carry are split. The split is even rather
 * than "fill the maximum, then a small remainder", because a 14,250,000 listing
 * next to a 40,000 one is conspicuous on the market, and a farm account that
 * repeatedly buys at the cap is the easiest possible pattern to spot.
 */
export function planCoinTrades(requestedCoins: number): CoinTradePlan {
  if (!Number.isFinite(requestedCoins) || !Number.isInteger(requestedCoins)) {
    throw new CoinTradePlanError('requestedCoins must be a whole number');
  }

  const minimumDeliverable = netFromBin(roundUpToBin(MIN_BIN_PRICE));
  if (requestedCoins < minimumDeliverable) {
    throw new CoinTradePlanError(
      `requestedCoins must be at least ${minimumDeliverable}; the market has a minimum listing price`,
    );
  }

  const tradeCount = Math.ceil(requestedCoins / MAX_NET_PER_TRADE);
  const perTrade = Math.ceil(requestedCoins / tradeCount);

  const trades: CoinTrade[] = [];
  let remaining = requestedCoins;

  for (let index = 0; index < tradeCount; index += 1) {
    const isLast = index === tradeCount - 1;
    const target = isLast ? remaining : Math.min(perTrade, remaining);

    // Gross up past the tax, then snap onto the ladder. Both steps round up, so
    // the resulting listing always clears `target`.
    const binPrice = roundUpToBin(target / (1 - MARKET_TAX_RATE));

    if (binPrice > MAX_BIN_PRICE) {
      // Only reachable if the ladder pushes the final trade over the cap.
      throw new CoinTradePlanError(
        `a trade of ${target} coins requires a listing above the ${MAX_BIN_PRICE} cap`,
      );
    }

    trades.push({ sequence: index + 1, binPrice, netCoins: netFromBin(binPrice) });
    remaining -= target;
  }

  const deliveredCoins = trades.reduce((sum, trade) => sum + trade.netCoins, 0);
  const grossCoinsSpent = trades.reduce((sum, trade) => sum + trade.binPrice, 0);

  return {
    requestedCoins,
    deliveredCoins,
    grossCoinsSpent,
    taxCoins: grossCoinsSpent - deliveredCoins,
    trades,
  };
}

/**
 * What a listing costs us per coin actually delivered.
 *
 * Supplier price alone understates the cost of an order by roughly 5%, because
 * the tax is paid in coins we bought. Pricing off the raw supplier rate quietly
 * eats the margin.
 */
export function grossUpForTax(netCoins: number): number {
  return Math.ceil(netCoins / (1 - MARKET_TAX_RATE));
}
