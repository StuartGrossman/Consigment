import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import { Category } from '../types';

// Global cache for categories
const categoriesCache = new Map<string, { data: Category[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const pendingRequests = new Map<string, Promise<Category[]>>();

export const useCategories = (activeOnly: boolean = false) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = activeOnly ? 'active' : 'all';

  const fetchCategories = async () => {
    // Check cache first
    const cached = categoriesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('📦 Using cached categories:', cacheKey);
      setCategories(cached.data);
      setLoading(false);
      return;
    }

    // Check if there's already a pending request
    if (pendingRequests.has(cacheKey)) {
      console.log('⏳ Waiting for existing categories request:', cacheKey);
      try {
        const result = await pendingRequests.get(cacheKey)!;
        setCategories(result);
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error waiting for pending request:', error);
      }
    }

    // Create new request
    const requestPromise = (async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔄 Fetching categories from API:', cacheKey);
        const categoriesData = activeOnly 
          ? await apiService.getActiveCategories() 
          : await apiService.getCategories();
        
        // Sort categories by display order
        const sortedCategories = categoriesData.sort((a, b) => 
          (a.displayOrder || 0) - (b.displayOrder || 0)
        );
        
        // Cache the result
        categoriesCache.set(cacheKey, {
          data: sortedCategories,
          timestamp: Date.now()
        });
        
        console.log('✅ Categories fetched and cached:', sortedCategories.length);
        return sortedCategories;
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch categories');
        
        // Fallback to hardcoded categories if API fails
        const fallbackCategories = [
          { id: 'hiking', name: 'Hiking', description: 'Trail and backpacking gear', icon: '🥾', bannerImage: '', attributes: [], isActive: true, displayOrder: -1, createdAt: '', updatedAt: '' },
          { id: 'climbing', name: 'Climbing', description: 'Rock climbing and bouldering gear', icon: '🧗', bannerImage: '', attributes: [], isActive: true, displayOrder: 0, createdAt: '', updatedAt: '' },
          { id: 'camping', name: 'Camping', description: 'Camping and outdoor shelter equipment', icon: '⛺', bannerImage: '', attributes: [], isActive: true, displayOrder: 1, createdAt: '', updatedAt: '' },
          { id: 'skiing', name: 'Skiing', description: 'Alpine and cross-country skiing equipment', icon: '⛷️', bannerImage: '', attributes: [], isActive: true, displayOrder: 2, createdAt: '', updatedAt: '' },
          { id: 'snowboarding', name: 'Snowboarding', description: 'Snowboarding equipment and gear', icon: '🏂', bannerImage: '', attributes: [], isActive: true, displayOrder: 3, createdAt: '', updatedAt: '' },
          { id: 'water-sports', name: 'Water Sports', description: 'Water sports and rafting equipment', icon: '🌊', bannerImage: '', attributes: [], isActive: true, displayOrder: 4, createdAt: '', updatedAt: '' },
          { id: 'cycling', name: 'Cycling', description: 'Mountain biking and cycling gear', icon: '🚵', bannerImage: '', attributes: [], isActive: true, displayOrder: 5, createdAt: '', updatedAt: '' },
          { id: 'apparel', name: 'Apparel', description: 'Outdoor clothing and apparel', icon: '👕', bannerImage: '', attributes: [], isActive: true, displayOrder: 6, createdAt: '', updatedAt: '' },
          { id: 'mountaineering', name: 'Mountaineering', description: 'High-altitude mountaineering gear', icon: '🏔️', bannerImage: '', attributes: [], isActive: true, displayOrder: 7, createdAt: '', updatedAt: '' },
          { id: 'footwear', name: 'Footwear', description: 'Hiking boots and outdoor footwear', icon: '👟', bannerImage: '', attributes: [], isActive: true, displayOrder: 8, createdAt: '', updatedAt: '' }
        ];
        
        categoriesCache.set(cacheKey, {
          data: fallbackCategories,
          timestamp: Date.now()
        });
        
        return fallbackCategories;
      } finally {
        setLoading(false);
        pendingRequests.delete(cacheKey);
      }
    })();

    // Store the pending request
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      setCategories(result);
    } catch (error) {
      console.error('Error in fetchCategories:', error);
    }
  };

  // Clear cache function
  const clearCache = () => {
    categoriesCache.clear();
    pendingRequests.clear();
    console.log('🗑️ Categories cache cleared');
  };

  // Refetch function that bypasses cache
  const refetch = async () => {
    clearCache();
    await fetchCategories();
  };

  useEffect(() => {
    fetchCategories();
  }, [activeOnly]);

  return {
    categories,
    loading,
    error,
    refetch,
    clearCache
  };
};

export default useCategories; 