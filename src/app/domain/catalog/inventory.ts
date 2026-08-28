export enum InventoryStatus {
  InStock = 'IN_STOCK',
  LowStock = 'LOW_STOCK',
  OutOfStock = 'OUT_OF_STOCK',
  PreOrder = 'PRE_ORDER',
  Discontinued = 'DISCONTINUED',
}

export interface Inventory {
  readonly status: InventoryStatus;
  /** Absent when the seller does not publish exact counts. */
  readonly remaining?: number;
  readonly maxPerOrder?: number;
}

export function isPurchasable(inventory: Inventory): boolean {
  return inventory.status === InventoryStatus.InStock
    || inventory.status === InventoryStatus.LowStock
    || inventory.status === InventoryStatus.PreOrder;
}
