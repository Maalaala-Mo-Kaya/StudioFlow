export type SortValue = string | number | boolean | Date | null | undefined;
export type TableSort = { column: string; direction: 'ascending' | 'descending' } | null;
export type TablePage = { page: number; pageSize: number };

export interface TableSortColumn<Row> {
  accessor?: (row: Row) => SortValue;
  compare?: (left: Row, right: Row) => number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const normalized = (value: SortValue) => value instanceof Date ? value.getTime() : value;
const missing = (value: SortValue) => value == null
  || (typeof value === 'string' && !value.trim())
  || (typeof value === 'number' && !Number.isFinite(value));

export function nextTableSort(sort: TableSort, column: string): TableSort {
  if (sort?.column !== column) return { column, direction: 'ascending' };
  return sort.direction === 'ascending' ? { column, direction: 'descending' } : null;
}

export function sortTableRows<Row>(
  rows: readonly Row[], column: TableSortColumn<Row> | undefined, sort: TableSort,
): readonly Row[] {
  if (!column || !sort) return rows;
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return rows.map((row) => ({ row, value: normalized(column.accessor?.(row)) }))
    .sort((left, right) => {
      const a = left.value;
      const b = right.value;
      if (column.accessor && (missing(a) || missing(b))) {
        return Number(missing(a)) - Number(missing(b));
      }
      if (column.compare) return direction * column.compare(left.row, right.row);
      if (typeof a === 'number' && typeof b === 'number') return direction * (a - b);
      if (typeof a === 'boolean' && typeof b === 'boolean') return direction * (Number(a) - Number(b));
      return direction * collator.compare(String(a), String(b));
    })
    .map(({ row }) => row);
}

export function tablePageRange(total: number, { page, pageSize }: TablePage) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  return {
    page: currentPage,
    totalPages,
    offset,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total),
  };
}
