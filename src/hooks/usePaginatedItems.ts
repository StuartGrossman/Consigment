import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';

interface UsePaginatedItemsOptions {
  pageSize?: number;
  status?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enableCache?: boolean;
}

interface UsePaginatedItemsReturn {
  items: ConsignmentItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  totalCount: number;
}

const itemCache = new Map<string, ConsignmentItem[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const usePaginatedItems = (
  options: UsePaginatedItemsOptions = {}
): UsePaginatedItemsReturn => {
  const {
    pageSize = 20,
    status = 'live',
    category,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    enableCache = true
  } = options;

  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [cacheTimestamp, setCacheTimestamp] = useState<number>(0);

  // Create cache key
  const cacheKey = useMemo(() => 
    `${status}-${category || 'all'}-${sortBy}-${sortOrder}`,
    [status, category, sortBy, sortOrder]
  );

  // Check cache validity
  const isCacheValid = useMemo(() => {
    if (!enableCache) return false;
    const now = Date.now();
    return (now - cacheTimestamp) < CACHE_DURATION;
  }, [enableCache, cacheTimestamp]);

  const buildQuery = useCallback((isFirstPage: boolean = true) => {
    const itemsRef = collection(db, 'items');
    let q = query(itemsRef, where('status', '==', status));

    if (category) {
      q = query(q, where('category', '==', category));
    }

    try {
      q = query(q, orderBy(sortBy, sortOrder));
    } catch (err) {
      // Fallback if index doesn't exist
      console.warn('Index not available for sorting, using default order');
    }

    q = query(q, limit(pageSize));

    if (!isFirstPage && lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    return q;
  }, [status, category, sortBy, sortOrder, pageSize, lastDoc]);

  const fetchItems = useCallback(async (isFirstPage: boolean = true) => {
    if (loading) return;

    // Check cache for first page
    if (isFirstPage && enableCache && isCacheValid) {
      const cached = itemCache.get(cacheKey);
      if (cached) {
        setItems(cached);
        setHasMore(cached.length >= pageSize);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const q = buildQuery(isFirstPage);
      const querySnapshot = await getDocs(q);
      
      const fetchedItems: ConsignmentItem[] = [];
      let lastDocument: DocumentSnapshot | null = null;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedItems.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate(),
          soldAt: data.soldAt?.toDate()
        } as ConsignmentItem);
        lastDocument = doc;
      });

      // Update state
      if (isFirstPage) {
        setItems(fetchedItems);
        setTotalCount(fetchedItems.length);
        
        // Cache first page
        if (enableCache) {
          itemCache.set(cacheKey, fetchedItems);
          setCacheTimestamp(Date.now());
        }
      } else {
        setItems(prev => [...prev, ...fetchedItems]);
        setTotalCount(prev => prev + fetchedItems.length);
      }

      setLastDoc(lastDocument);
      setHasMore(fetchedItems.length === pageSize);

    } catch (err) {
      console.error('Error fetching items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, enableCache, isCacheValid, cacheKey, pageSize, buildQuery]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    fetchItems(false);
  }, [hasMore, loading, fetchItems]);

  const refresh = useCallback(() => {
    // Clear cache
    if (enableCache) {
      itemCache.delete(cacheKey);
    }
    
    setItems([]);
    setLastDoc(null);
    setHasMore(true);
    setTotalCount(0);
    setCacheTimestamp(0);
    fetchItems(true);
  }, [enableCache, cacheKey, fetchItems]);

  // Initial load
  useEffect(() => {
    fetchItems(true);
  }, [status, category, sortBy, sortOrder]);

  // Cleanup cache on unmount
  useEffect(() => {
    return () => {
      if (!enableCache) return;
      
      // Clean up old cache entries
      const now = Date.now();
      for (const [key] of itemCache.entries()) {
        // Note: We're using a simple cache without timestamps per entry
        // This cleanup is handled by the cache validity check
        itemCache.delete(key);
      }
    };
  }, [enableCache]);

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalCount
  };
}; 