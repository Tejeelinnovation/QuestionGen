import React from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CustomSelect } from './custom-select';

export interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemName = 'items',
  className = '',
}) => {
  const breakpoint = useBreakpoint();
  const totalPages = Math.ceil(totalCount / pageSize);

  // Conditional visibility: hide pagination if not needed
  if (totalCount <= pageSize || totalPages <= 1 || totalCount === 0) {
    return null;
  }

  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalCount);
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers with ellipses
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
    return pages;
  };

  // -------------------------------------------------------------------------
  // Mobile Tier (<= 767px): Touch targets >= 44px, compact two-action bar
  // -------------------------------------------------------------------------
  if (breakpoint === 'mobile') {
    return (
      <nav
        aria-label="Pagination Navigation Mobile"
        className={`flex items-center justify-between gap-2 pt-4 border-t border-border font-body ${className}`}
      >
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-11 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold active:bg-ink active:text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <div className="text-center font-heading text-xs font-semibold text-ink/80">
          <span>Page </span>
          <span className="font-bold text-forest">{currentPage}</span>
          <span className="text-ink/40"> / </span>
          <span>{totalPages}</span>
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-11 px-4 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold active:bg-ink active:text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>
    );
  }

  // -------------------------------------------------------------------------
  // Tablet Tier (768px - 1024px): Mid-density centered pill controls
  // -------------------------------------------------------------------------
  if (breakpoint === 'tablet') {
    return (
      <nav
        aria-label="Pagination Navigation Tablet"
        className={`flex items-center justify-between gap-4 pt-5 border-t border-border font-body ${className}`}
      >
        <div className="font-body text-xs text-ink/70">
          Showing <strong className="text-ink font-heading">{startItem}–{endItem}</strong> of{' '}
          <strong className="text-ink font-heading">{totalCount}</strong> {itemName}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous Page"
            className="w-9 h-9 rounded-pill border border-border bg-surface text-ink flex items-center justify-center text-xs font-heading hover:bg-ink hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs font-heading text-ink/40 select-none">
                  ...
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-9 h-9 rounded-pill font-heading text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                  isActive
                    ? 'bg-forest text-white'
                    : 'bg-surface border border-border text-ink hover:border-forest/60'
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next Page"
            className="w-9 h-9 rounded-pill border border-border bg-surface text-ink flex items-center justify-center text-xs font-heading hover:bg-ink hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-xs cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>
    );
  }

  // -------------------------------------------------------------------------
  // Desktop Tier (> 1024px): Full bento dual-sided bar with hover lifts
  // -------------------------------------------------------------------------
  return (
    <nav
      aria-label="Pagination Navigation Desktop"
      className={`flex items-center justify-between gap-4 pt-6 border-t border-border font-body ${className}`}
    >
      <div className="flex items-center gap-4">
        <p className="text-xs font-body text-ink/75">
          Showing{' '}
          <span className="font-heading font-bold text-forest underline decoration-forest/30 underline-offset-2">
            {startItem}–{endItem}
          </span>{' '}
          of{' '}
          <span className="font-heading font-bold text-ink underline decoration-ink/25 underline-offset-2">
            {totalCount}
          </span>{' '}
          {itemName}
        </p>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs text-ink/65 pl-2 border-l border-border">
            <span>Per page:</span>
            <CustomSelect
              value={String(pageSize)}
              onChange={(val) => {
                onPageSizeChange(Number(val));
                onPageChange(1);
              }}
              options={pageSizeOptions.map((opt) => ({
                value: String(opt),
                label: String(opt),
              }))}
              className="w-16"
              triggerClassName="py-0.5 px-2 text-xs"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="First Page"
          className="w-8 h-8 rounded-pill border border-border bg-surface text-ink flex items-center justify-center text-xs font-heading hover:bg-ink hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none shadow-xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous Page"
          className="px-3 h-8 rounded-pill border border-border bg-surface text-ink flex items-center gap-1 text-xs font-heading font-semibold hover:bg-ink hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none shadow-xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <div className="flex items-center gap-1 px-1">
          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-xs font-heading text-ink/40 select-none">
                  ...
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-8 h-8 rounded-pill font-heading text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                  isActive
                    ? 'bg-forest text-white font-bold'
                    : 'bg-surface border border-border text-ink hover:border-forest hover:-translate-y-0.5'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Next Page"
          className="px-3 h-8 rounded-pill border border-border bg-surface text-ink flex items-center gap-1 text-xs font-heading font-semibold hover:bg-ink hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none shadow-xs hover:-translate-y-0.5 cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="Last Page"
          className="w-8 h-8 rounded-pill border border-border bg-surface text-ink flex items-center justify-center text-xs font-heading hover:bg-ink hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none shadow-xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
};
