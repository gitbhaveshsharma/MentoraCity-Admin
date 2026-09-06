"use client";

export const PAGE_SIZE = 20;

export function TablePagination({
  page,
  pageSize = PAGE_SIZE,
  total,
  onPageChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  if (total <= pageSize) {
    return (
      <div className="table-pagination">
        <span>
          Showing {total} item{total === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  return (
    <div className="table-pagination">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="table-pagination-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          Previous
        </button>
        <span className="table-pagination-page">
          Page {current} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function paginateItems<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const start = (Math.max(page, 1) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
