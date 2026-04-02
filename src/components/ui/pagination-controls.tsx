"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function PaginationControls({ page, totalPages, onPageChange, disabled }: PaginationControlsProps) {
  const [jumpValue, setJumpValue] = React.useState("");

  if (totalPages <= 1) return null;

  // Generate page numbers to show: always show first, last, current, and neighbors
  function getPageNumbers(): (number | "...")[] {
    const pages: (number | "...")[] = [];
    const range = 1; // how many neighbors around current

    const start = Math.max(2, page - range);
    const end = Math.min(totalPages - 1, page + range);

    pages.push(1);

    if (start > 2) pages.push("...");

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) pages.push("...");

    if (totalPages > 1) pages.push(totalPages);

    return pages;
  }

  function handleJump(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(jumpValue, 10);
    if (num >= 1 && num <= totalPages && num !== page) {
      onPageChange(num);
    }
    setJumpValue("");
  }

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
      {/* First page */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(1)}
        disabled={page <= 1 || disabled}
        title="First page"
      >
        <ChevronsLeftIcon className="size-4" />
      </Button>

      {/* Previous */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1 || disabled}
        title="Previous page"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>

      {/* Page numbers */}
      {pageNumbers.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-1 text-sm text-muted-foreground select-none">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => onPageChange(p)}
            disabled={disabled}
          >
            {p}
          </Button>
        )
      )}

      {/* Next */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages || disabled}
        title="Next page"
      >
        <ChevronRightIcon className="size-4" />
      </Button>

      {/* Last page */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(totalPages)}
        disabled={page >= totalPages || disabled}
        title="Last page"
      >
        <ChevronsRightIcon className="size-4" />
      </Button>

      {/* Jump to page */}
      {totalPages > 5 && (
        <form onSubmit={handleJump} className="flex items-center gap-1.5 ml-2">
          <span className="text-xs text-muted-foreground">Go to</span>
          <Input
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            placeholder={String(page)}
            className="w-14 h-7 text-xs text-center"
            type="number"
            min={1}
            max={totalPages}
          />
        </form>
      )}

      <span className="text-xs text-muted-foreground ml-2">
        Page {page} of {totalPages}
      </span>
    </div>
  );
}
