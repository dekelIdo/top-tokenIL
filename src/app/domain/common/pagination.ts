export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 12;

export function emptyPage<T>(pageSize: number = DEFAULT_PAGE_SIZE): Page<T> {
  return { items: [], page: 1, pageSize, total: 0, hasMore: false };
}

export function paginate<T>(all: readonly T[], request: PageRequest): Page<T> {
  const page = Math.max(1, request.page);
  const pageSize = Math.max(1, request.pageSize);
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return { items, page, pageSize, total: all.length, hasMore: start + items.length < all.length };
}
