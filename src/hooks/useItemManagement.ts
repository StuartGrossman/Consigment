import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ConsignmentItem } from '../types';
import { User } from 'firebase/auth';

export interface ItemFilters {
  category: string;
  gender: string;
  size: string;
  brand: string;
  color: string;
  priceRange: string;
  sortBy: string;
  searchQuery: string;
}

export interface ItemManagement {
  items: ConsignmentItem[];
  loadingItems: boolean;
  filters: ItemFilters;
  selectedCategory: string | null;
  activeCategoryFilter: string | null;
  filterCollapsed: boolean;
  
  // Actions
  fetchItems: () => Promise<void>;
  handleFilterChange: (filterType: string, value: string) => void;
  clearFilters: () => void;
  getFilteredAndSortedItems: () => ConsignmentItem[];
  getItemsByCategory: () => { [key: string]: ConsignmentItem[] };
  handleCategoryFilter: (category: string) => void;
  clearCategoryFilter: () => void;
  setFilterCollapsed: (collapsed: boolean) => void;
  setSelectedCategory: (category: string | null) => void;
}

// Global cache for items
const itemsCache = new Map<string, { data: ConsignmentItem[], timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes for items (shorter than categories)
const pendingItemRequests = new Map<string, Promise<ConsignmentItem[]>>();

export const useItemManagement = (
  isAuthenticated: boolean,
  cleanupBookmarks?: (items: ConsignmentItem[]) => void
): ItemManagement => {
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  
  const [filters, setFilters] = useState<ItemFilters>({
    category: '',
    gender: '',
    size: '',
    brand: '',
    color: '',
    priceRange: '',
    sortBy: 'newest',
    searchQuery: ''
  });

  const fetchItems = useCallback(async () => {
    const cacheKey = 'live-items';
    
    // Check cache first
    const cached = itemsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('📦 Using cached items');
      setItems(cached.data);
      setLoadingItems(false);
      
      // Clean up bookmarks to remove sold/unavailable items
      if (isAuthenticated && cleanupBookmarks) {
        cleanupBookmarks(cached.data);
      }
      return;
    }

    // Check if there's already a pending request
    if (pendingItemRequests.has(cacheKey)) {
      console.log('⏳ Waiting for existing items request');
      try {
        const result = await pendingItemRequests.get(cacheKey)!;
        setItems(result);
        setLoadingItems(false);
        
        // Clean up bookmarks to remove sold/unavailable items
        if (isAuthenticated && cleanupBookmarks) {
          cleanupBookmarks(result);
        }
        return;
      } catch (error) {
        console.error('Error waiting for pending request:', error);
      }
    }

    // Create new request
    const requestPromise = (async () => {
      try {
        console.log('🔄 Fetching live items from Firestore...');
        const itemsRef = collection(db, 'items');
        const q = query(itemsRef, where('status', '==', 'live'));
        const querySnapshot = await getDocs(q);
        const fetchedItems: ConsignmentItem[] = [];
        
        console.log(`📊 Found ${querySnapshot.size} live items`);
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const item = { 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            approvedAt: data.approvedAt?.toDate(),
            liveAt: data.liveAt?.toDate()
          } as ConsignmentItem;
          
          fetchedItems.push(item);
        });
        
        // Sort client-side by live date or creation date
        fetchedItems.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return bTime.getTime() - aTime.getTime();
        });
        
        // Cache the result
        itemsCache.set(cacheKey, {
          data: fetchedItems,
          timestamp: Date.now()
        });
        
        console.log(`✅ Items fetched and cached: ${fetchedItems.length} items`);
        return fetchedItems;
      } catch (error) {
        console.error('❌ Error fetching items:', error);
        return [];
      } finally {
        setLoadingItems(false);
        pendingItemRequests.delete(cacheKey);
      }
    })();

    // Store the pending request
    pendingItemRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      setItems(result);
      
      // Clean up bookmarks to remove sold/unavailable items
      if (isAuthenticated && cleanupBookmarks) {
        cleanupBookmarks(result);
      }
    } catch (error) {
      console.error('Error in fetchItems:', error);
      setItems([]);
    }
  }, [isAuthenticated, cleanupBookmarks]);

  // Clear cache function
  const clearItemsCache = useCallback(async () => {
    itemsCache.clear();
    pendingItemRequests.clear();
    console.log('🗑️ Items cache cleared');
    await fetchItems(); // Refetch items after clearing cache
  }, [fetchItems]);

  // Fetch items when authenticated status changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchItems();
    } else {
      setLoadingItems(false);
    }
  }, [isAuthenticated, fetchItems]);

  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      gender: '',
      size: '',
      brand: '',
      color: '',
      priceRange: '',
      sortBy: 'newest',
      searchQuery: ''
    });
  };

  const getFilteredAndSortedItems = (): ConsignmentItem[] => {
    let filteredItems = items;

    // Apply active category filter first if set
    if (activeCategoryFilter) {
      filteredItems = filteredItems.filter(item => 
        item.category === activeCategoryFilter
      );
    }

    // Apply search query
    if (filters.searchQuery) {
      filteredItems = filteredItems.filter(item =>
        item.title.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(filters.searchQuery.toLowerCase()))
      );
    }

    // Apply filters
    if (filters.category) {
      filteredItems = filteredItems.filter(item => item.category === filters.category);
    }
    if (filters.gender) {
      filteredItems = filteredItems.filter(item => item.gender === filters.gender);
    }
    if (filters.size) {
      filteredItems = filteredItems.filter(item => item.size === filters.size);
    }
    if (filters.brand) {
      filteredItems = filteredItems.filter(item => item.brand === filters.brand);
    }
    if (filters.color) {
      filteredItems = filteredItems.filter(item => item.color === filters.color);
    }
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split('-').map(Number);
      filteredItems = filteredItems.filter(item => {
        const price = item.price;
        if (max) {
          return price >= min && price <= max;
        }
        return price >= min;
      });
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'price-low':
        filteredItems.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        filteredItems.sort((a, b) => b.price - a.price);
        break;
      case 'name':
        filteredItems.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'category':
        filteredItems.sort((a, b) => {
          const aCat = a.category || '';
          const bCat = b.category || '';
          if (aCat === bCat) {
            return a.title.localeCompare(b.title);
          }
          return aCat.localeCompare(bCat);
        });
        break;
      case 'newest':
      default:
        filteredItems.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return bTime.getTime() - aTime.getTime();
        });
        break;
    }

    return filteredItems;
  };

  const getItemsByCategory = () => {
    const filteredItems = getFilteredAndSortedItems();
    const categoriesWithItems: { [key: string]: ConsignmentItem[] } = {};

    filteredItems.forEach(item => {
      const category = item.category || 'Other';
      if (!categoriesWithItems[category]) {
        categoriesWithItems[category] = [];
      }
      categoriesWithItems[category].push(item);
    });

    return categoriesWithItems;
  };

  const handleCategoryFilter = (category: string) => {
    if (activeCategoryFilter === category) {
      setActiveCategoryFilter(null);
    } else {
      setActiveCategoryFilter(category);
    }
  };

  const clearCategoryFilter = () => {
    setActiveCategoryFilter(null);
  };

  return {
    items,
    loadingItems,
    filters,
    selectedCategory,
    activeCategoryFilter,
    filterCollapsed,
    fetchItems: clearItemsCache, // Return clearItemsCache to allow manual refresh
    handleFilterChange,
    clearFilters,
    getFilteredAndSortedItems,
    getItemsByCategory,
    handleCategoryFilter,
    clearCategoryFilter,
    setFilterCollapsed,
    setSelectedCategory,
  };
}; 