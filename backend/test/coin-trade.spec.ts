/**
 * The transfer-market delivery calculation.
 *
 * These numbers are what the customer is told to type into the game. A price
 * that is off EA's increment ladder cannot be entered at all, and a price that
 * under-delivers turns a paid order into a support ticket. Both failure modes
 * are silent in production, so they are asserted here.
 */
import {
  CoinTradePlanError,
  MARKET_TAX_RATE,
  MAX_BIN_PRICE,
  MAX_NET_PER_TRADE,
  MIN_BIN_PRICE,
  binStep,
  grossUpForTax,
  netFromBin,
  planCoinTrades,
  roundUpToBin,
} from '../src/modules/fulfillment/coin-trade';

describe('the Buy-It-Now increment ladder', () => {
  it.each([
    [200, 50],
    [999, 50],
    [1_000, 100],
    [9_999, 100],
    [10_000, 250],
    [49_999, 250],
    [50_000, 500],
    [99_999, 500],
    [100_000, 1_000],
    [5_000_000, 1_000],
  ])('a price of %i snaps to steps of %i', (price, step) => {
    expect(binStep(price)).toBe(step);
  });

  it('rounds every price onto its own band', () => {
    for (let price = MIN_BIN_PRICE; price < 200_000; price += 37) {
      const snapped = roundUpToBin(price);

      expect(snapped).toBeGreaterThanOrEqual(price);
      expect(snapped % binStep(snapped)).toBe(0);
    }
  });

  it('settles when rounding pushes a price into the next band', () => {
    // 999 rounds to 1,000 on a step of 50, but 1,000 belongs to the step-100
    // band. The result has to be valid under the band it lands in, not the one
    // it started in.
    const snapped = roundUpToBin(999);

    expect(snapped % binStep(snapped)).toBe(0);
  });

  it('never returns a price below the market minimum', () => {
    expect(roundUpToBin(1)).toBeGreaterThanOrEqual(MIN_BIN_PRICE);
  });
});

describe('EA market tax', () => {
  it('takes 5% of the listing price from the seller', () => {
    expect(netFromBin(1_000_000)).toBe(950_000);
    expect(MARKET_TAX_RATE).toBe(0.05);
  });

  it('grossing up and taxing back returns at least the original amount', () => {
    for (const net of [1_000, 50_000, 250_000, 1_000_000, 7_500_000]) {
      expect(netFromBin(grossUpForTax(net))).toBeGreaterThanOrEqual(net);
    }
  });
});

describe('planning a delivery', () => {
  it('delivers at least what was ordered', () => {
    for (const requested of [5_000, 100_000, 1_000_000, 2_500_000, 9_999_999]) {
      const plan = planCoinTrades(requested);

      expect(plan.deliveredCoins).toBeGreaterThanOrEqual(requested);
    }
  });

  it('never under-delivers on any amount in a wide sweep', () => {
    // Under-delivery is the failure that reaches a customer as "I paid for a
    // million and got 950,000", so it is swept rather than spot-checked.
    for (let requested = 1_000; requested <= 3_000_000; requested += 7_919) {
      const plan = planCoinTrades(requested);

      expect(plan.deliveredCoins).toBeGreaterThanOrEqual(requested);
    }
  });

  it('produces prices the game will accept', () => {
    for (const requested of [1_000, 999_999, 1_000_000, 20_000_000, 45_000_000]) {
      for (const trade of planCoinTrades(requested).trades) {
        expect(trade.binPrice % binStep(trade.binPrice)).toBe(0);
        expect(trade.binPrice).toBeGreaterThanOrEqual(MIN_BIN_PRICE);
        expect(trade.binPrice).toBeLessThanOrEqual(MAX_BIN_PRICE);
      }
    }
  });

  it('uses one listing when the order fits in one', () => {
    expect(planCoinTrades(1_000_000).trades).toHaveLength(1);
  });

  it('reports the tax as the difference between what we pay and they receive', () => {
    const plan = planCoinTrades(1_000_000);

    expect(plan.taxCoins).toBe(plan.grossCoinsSpent - plan.deliveredCoins);
    expect(plan.grossCoinsSpent).toBeGreaterThan(plan.deliveredCoins);
  });

  it('costs us roughly 5% more coins than the customer receives', () => {
    const plan = planCoinTrades(1_000_000);
    const overhead = plan.grossCoinsSpent / plan.deliveredCoins;

    expect(overhead).toBeGreaterThan(1.05);
    expect(overhead).toBeLessThan(1.06);
  });
});

describe('orders too large for one listing', () => {
  it('splits an order that exceeds the single-listing cap', () => {
    const plan = planCoinTrades(MAX_NET_PER_TRADE * 2);

    expect(plan.trades.length).toBeGreaterThan(1);
    expect(plan.deliveredCoins).toBeGreaterThanOrEqual(MAX_NET_PER_TRADE * 2);
  });

  it('splits evenly rather than filling the cap and leaving a remainder', () => {
    // A listing at the cap next to a tiny one is a conspicuous pattern for a
    // farm account. Even splits are the point, so this asserts the shape.
    const plan = planCoinTrades(MAX_NET_PER_TRADE + 1_000_000);
    const prices = plan.trades.map((trade) => trade.binPrice);
    const spread = Math.max(...prices) - Math.min(...prices);

    expect(plan.trades).toHaveLength(2);
    expect(spread).toBeLessThan(MAX_BIN_PRICE * 0.05);
  });

  it('numbers the trades from one so they can be displayed in order', () => {
    const plan = planCoinTrades(MAX_NET_PER_TRADE * 3);

    expect(plan.trades.map((trade) => trade.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps every listing under the cap however large the order', () => {
    const plan = planCoinTrades(100_000_000);

    for (const trade of plan.trades) {
      expect(trade.binPrice).toBeLessThanOrEqual(MAX_BIN_PRICE);
    }
  });
});

describe('refusing impossible orders', () => {
  it('rejects an amount below the market minimum', () => {
    expect(() => planCoinTrades(10)).toThrow(CoinTradePlanError);
  });

  it('rejects a fractional amount', () => {
    expect(() => planCoinTrades(1_000.5)).toThrow(CoinTradePlanError);
  });

  it('rejects a non-finite amount', () => {
    expect(() => planCoinTrades(Number.NaN)).toThrow(CoinTradePlanError);
  });
});
