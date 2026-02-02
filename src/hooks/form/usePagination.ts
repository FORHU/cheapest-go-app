/**
 * usePagination Hook
 * Reusable pagination logic for lists and search results
 */

import { useState, useMemo, useCallback } from 'react';

export interface UsePaginationOptions {
    /** Total number of items */
    totalItems: number;
    /** Items per page (default: 10) */
    itemsPerPage?: number;
    /** Initial page (default: 1) */
    initialPage?: number;
    /** Sibling count for page numbers (default: 1) */
    siblingCount?: number;
}

export interface UsePaginationReturn<T = unknown> {
    /** Current page number (1-indexed) */
    currentPage: number;
    /** Total number of pages */
    totalPages: number;
    /** Items per page */
    itemsPerPage: number;
    /** Whether there's a previous page */
    hasPreviousPage: boolean;
    /** Whether there's a next page */
    hasNextPage: boolean;
    /** Start index for slicing array (0-indexed) */
    startIndex: number;
    /** End index for slicing array (0-indexed, exclusive) */
    endIndex: number;
    /** Page numbers to display */
    pageNumbers: (number | 'ellipsis')[];
    /** Go to specific page */
    goToPage: (page: number) => void;
    /** Go to next page */
    nextPage: () => void;
    /** Go to previous page */
    previousPage: () => void;
    /** Go to first page */
    firstPage: () => void;
    /** Go to last page */
    lastPage: () => void;
    /** Reset to initial page */
    reset: () => void;
    /** Paginate an array */
    paginate: <T>(items: T[]) => T[];
}

/**
 * Generate page numbers with ellipsis
 */
const generatePageNumbers = (
    currentPage: number,
    totalPages: number,
    siblingCount: number
): (number | 'ellipsis')[] => {
    const totalPageNumbers = siblingCount * 2 + 5; // siblings + first + last + current + 2 ellipsis

    // If total pages is less than total page numbers, show all pages
    if (totalPages <= totalPageNumbers) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const showLeftEllipsis = leftSiblingIndex > 2;
    const showRightEllipsis = rightSiblingIndex < totalPages - 1;

    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    // Left ellipsis
    if (showLeftEllipsis) {
        pages.push('ellipsis');
    } else if (leftSiblingIndex > 1) {
        // Show page 2 if no ellipsis but there's a gap
        for (let i = 2; i < leftSiblingIndex; i++) {
            pages.push(i);
        }
    }

    // Sibling pages and current page
    for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
        if (i !== 1 && i !== totalPages) {
            pages.push(i);
        }
    }

    // Right ellipsis
    if (showRightEllipsis) {
        pages.push('ellipsis');
    } else if (rightSiblingIndex < totalPages) {
        // Show remaining pages if no ellipsis
        for (let i = rightSiblingIndex + 1; i < totalPages; i++) {
            pages.push(i);
        }
    }

    // Always show last page
    if (totalPages > 1) {
        pages.push(totalPages);
    }

    return pages;
};

/**
 * Reusable pagination hook
 *
 * @example
 * const {
 *   currentPage,
 *   totalPages,
 *   pageNumbers,
 *   goToPage,
 *   nextPage,
 *   previousPage,
 *   paginate
 * } = usePagination({ totalItems: 100, itemsPerPage: 10 });
 *
 * // Paginate array
 * const paginatedItems = paginate(items);
 *
 * // Render page numbers
 * {pageNumbers.map((page, i) =>
 *   page === 'ellipsis' ? <span key={i}>...</span> : (
 *     <button key={i} onClick={() => goToPage(page)}>{page}</button>
 *   )
 * )}
 */
export function usePagination<T = unknown>({
    totalItems,
    itemsPerPage = 10,
    initialPage = 1,
    siblingCount = 1,
}: UsePaginationOptions): UsePaginationReturn<T> {
    const [currentPage, setCurrentPage] = useState(initialPage);

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    // Ensure current page is within bounds
    const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    if (validCurrentPage !== currentPage) {
        setCurrentPage(validCurrentPage);
    }

    const hasPreviousPage = validCurrentPage > 1;
    const hasNextPage = validCurrentPage < totalPages;

    const startIndex = (validCurrentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    const pageNumbers = useMemo(
        () => generatePageNumbers(validCurrentPage, totalPages, siblingCount),
        [validCurrentPage, totalPages, siblingCount]
    );

    const goToPage = useCallback(
        (page: number) => {
            const targetPage = Math.min(Math.max(1, page), totalPages);
            setCurrentPage(targetPage);
        },
        [totalPages]
    );

    const nextPage = useCallback(() => {
        if (hasNextPage) {
            setCurrentPage((prev) => prev + 1);
        }
    }, [hasNextPage]);

    const previousPage = useCallback(() => {
        if (hasPreviousPage) {
            setCurrentPage((prev) => prev - 1);
        }
    }, [hasPreviousPage]);

    const firstPage = useCallback(() => {
        setCurrentPage(1);
    }, []);

    const lastPage = useCallback(() => {
        setCurrentPage(totalPages);
    }, [totalPages]);

    const reset = useCallback(() => {
        setCurrentPage(initialPage);
    }, [initialPage]);

    const paginate = useCallback(
        <T>(items: T[]): T[] => {
            return items.slice(startIndex, endIndex);
        },
        [startIndex, endIndex]
    );

    return {
        currentPage: validCurrentPage,
        totalPages,
        itemsPerPage,
        hasPreviousPage,
        hasNextPage,
        startIndex,
        endIndex,
        pageNumbers,
        goToPage,
        nextPage,
        previousPage,
        firstPage,
        lastPage,
        reset,
        paginate,
    };
}

export default usePagination;
