import { useState, useEffect, useCallback, useRef } from 'react';

interface PaginationOptions {
  pageSize?: number;
  initialPage?: number;
  cacheSize?: number;
  debounceMs?: number;
}

interface PaginationState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  currentPage: number;
  totalItems: number;
  totalPages: number;
}

interface UsePaginatedDataReturn<T> extends PaginationState<T> {
  loadNextPage: () => Promise<void>;
  loadPage: (page: number) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  isLoadingMore: boolean;
}

export function usePaginatedData<T>(
  fetchFunction: (page: number, pageSize: number) => Promise<{
    data: T[];
    total: number;
    hasMore: boolean;
  }>,
  options: PaginationOptions = { pageSize: 20 }
): UsePaginatedDataReturn<T> {
  const {
    pageSize = 20,
    initialPage = 1,
    cacheSize = 100,
    debounceMs = 300
  } = options;

  const [state, setState] = useState<PaginationState<T>>({
    data: [],
    loading: false,
    error: null,
    hasMore: true,
    currentPage: initialPage,
    totalItems: 0,
    totalPages: 0
  });

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const cache = useRef<Map<number, T[]>>(new Map());
  const abortController = useRef<AbortController | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Debounced fetch function
  const debouncedFetch = useCallback((page: number) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    return new Promise<void>((resolve, reject) => {
      debounceTimeout.current = setTimeout(async () => {
        try {
          await fetchPage(page);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, debounceMs);
    });
  }, [debounceMs]);

  // Fetch a specific page
  const fetchPage = useCallback(async (page: number) => {
    // Cancel previous request
    if (abortController.current) {
      abortController.current.abort();
    }

    abortController.current = new AbortController();

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const result = await fetchFunction(page, pageSize);
      
      // Check if request was cancelled
      if (abortController.current.signal.aborted) {
        return;
      }

      const totalPages = Math.ceil(result.total / pageSize);

      // Cache the result
      cache.current.set(page, result.data);

      // Limit cache size
      if (cache.current.size > cacheSize) {
        const firstKey = cache.current.keys().next().value;
        cache.current.delete(firstKey);
      }

      setState(prev => ({
        ...prev,
        data: result.data,
        loading: false,
        hasMore: result.hasMore,
        currentPage: page,
        totalItems: result.total,
        totalPages
      }));

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Request was cancelled
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to fetch data'
      }));
    }
  }, [fetchFunction, pageSize, cacheSize]);

  // Load next page
  const loadNextPage = useCallback(async () => {
    if (state.loading || !state.hasMore) return;

    setIsLoadingMore(true);
    try {
      await fetchPage(state.currentPage + 1);
    } finally {
      setIsLoadingMore(false);
    }
  }, [state.loading, state.hasMore, state.currentPage, fetchPage]);

  // Load specific page
  const loadPage = useCallback(async (page: number) => {
    if (state.loading) return;

    // Check cache first
    const cachedData = cache.current.get(page);
    if (cachedData) {
      setState(prev => ({
        ...prev,
        data: cachedData,
        currentPage: page
      }));
      return;
    }

    await fetchPage(page);
  }, [state.loading, fetchPage]);

  // Refresh current page
  const refresh = useCallback(async () => {
    // Clear cache for current page
    cache.current.delete(state.currentPage);
    await fetchPage(state.currentPage);
  }, [state.currentPage, fetchPage]);

  // Reset to initial state
  const reset = useCallback(() => {
    cache.current.clear();
    setState({
      data: [],
      loading: false,
      error: null,
      hasMore: true,
      currentPage: initialPage,
      totalItems: 0,
      totalPages: 0
    });
    setIsLoadingMore(false);
  }, [initialPage]);

  // Load initial data
  useEffect(() => {
    fetchPage(initialPage);

    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [initialPage]);

  return {
    ...state,
    loadNextPage,
    loadPage,
    refresh,
    reset,
    isLoadingMore
  };
}

// Hook for infinite scroll with intersection observer
export function useInfiniteScroll(
  onLoadMore: () => void,
  hasMore: boolean,
  loading: boolean
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || !hasMore || loading) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [onLoadMore, hasMore, loading]);

  return loadMoreRef;
} 