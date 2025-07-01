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
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('status', '==', 'live'));
      const querySnapshot = await getDocs(q);
      const fetchedItems: ConsignmentItem[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedItems.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          approvedAt: data.approvedAt?.toDate(),
          liveAt: data.liveAt?.toDate()
        } as ConsignmentItem);
      });
      
      // Sort client-side by live date or creation date
      fetchedItems.sort((a, b) => {
        const aTime = a.liveAt || a.createdAt;
        const bTime = b.liveAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });
      
      setItems(fetchedItems);
      
      // Clean up bookmarks to remove sold/unavailable items
      if (isAuthenticated && cleanupBookmarks) {
        cleanupBookmarks(fetchedItems);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [isAuthenticated, cleanupBookmarks]);

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
        if (max) return item.price >= min && item.price <= max;
        return item.price >= min;
      });
    }

    // Sort items
    switch (filters.sortBy) {
      case 'price-low':
        return filteredItems.sort((a, b) => a.price - b.price);
      case 'price-high':
        return filteredItems.sort((a, b) => b.price - a.price);
      case 'newest':
        return filteredItems.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return bTime.getTime() - aTime.getTime();
        });
      case 'oldest':
        return filteredItems.sort((a, b) => {
          const aTime = a.liveAt || a.createdAt;
          const bTime = b.liveAt || b.createdAt;
          return aTime.getTime() - bTime.getTime();
        });
      default:
        return filteredItems;
    }
  };

  const getItemsByCategory = (): { [key: string]: ConsignmentItem[] } => {
    const filteredItems = getFilteredAndSortedItems();
    const categories: { [key: string]: ConsignmentItem[] } = {};
    
    filteredItems.forEach((item: ConsignmentItem) => {
      const category = item.category || 'Uncategorized';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(item);
    });
    
    // Sort categories by item count (most items first)
    const sortedCategories = Object.entries(categories)
      .sort(([, a], [, b]) => b.length - a.length)
      .reduce((acc, [category, items]) => {
        acc[category] = items;
        return acc;
      }, {} as { [key: string]: ConsignmentItem[] });
    
    return sortedCategories;
  };

  const handleCategoryFilter = (category: string) => {
    setActiveCategoryFilter(category);
    clearFilters(); // Clear other filters when applying category filter
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
    fetchItems,
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