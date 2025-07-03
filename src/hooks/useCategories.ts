import { useState, useEffect } from 'react';
import { apiService, Category } from '../services/apiService';

export const useCategories = (activeOnly: boolean = false) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const categoriesData = activeOnly 
        ? await apiService.getActiveCategories() 
        : await apiService.getCategories();
      
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      
      // Fallback to hardcoded categories if API fails
      setCategories([
        { id: 'climbing', name: 'Climbing', description: 'Rock climbing and bouldering gear', icon: '🧗', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'skiing', name: 'Skiing', description: 'Alpine and cross-country skiing equipment', icon: '⛷️', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'hiking', name: 'Hiking', description: 'Trail and backpacking gear', icon: '🥾', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'camping', name: 'Camping', description: 'Camping and outdoor shelter equipment', icon: '⛺', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'mountaineering', name: 'Mountaineering', description: 'High-altitude mountaineering gear', icon: '🏔️', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'snowboarding', name: 'Snowboarding', description: 'Snowboarding equipment and gear', icon: '🏂', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'cycling', name: 'Cycling', description: 'Mountain biking and cycling gear', icon: '🚵', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'water-sports', name: 'Water Sports', description: 'Water sports and rafting equipment', icon: '🌊', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'apparel', name: 'Apparel', description: 'Outdoor clothing and apparel', icon: '👕', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' },
        { id: 'footwear', name: 'Footwear', description: 'Hiking boots and outdoor footwear', icon: '👟', bannerImage: '', attributes: [], isActive: true, createdAt: '', updatedAt: '' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [activeOnly]);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories
  };
};

export default useCategories; 