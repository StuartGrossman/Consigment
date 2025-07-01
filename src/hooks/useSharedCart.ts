import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { useAuth } from './useAuth';

interface SharedCartItem {
  item_id: string;
  title: string;
  price: number;
  quantity: number;
  barcode_data: string;
  added_by: string;
  added_by_email: string;
  seller_id: string;
  seller_name: string;
}

interface SharedCartData {
  cart_id: string;
  items: SharedCartItem[];
  total_amount: number;
  item_count: number;
  created_by_email: string;
  last_updated: any;
  status: 'active' | 'completed' | 'cancelled';
}

export const useSharedCart = () => {
  const { user } = useAuth();
  const [currentCartId, setCurrentCartId] = useState<string | null>(null);
  const [cartData, setCartData] = useState<SharedCartData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userCarts, setUserCarts] = useState<any[]>([]);

  // Create a new shared cart
  const createSharedCart = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiService.createSharedCart();
      
      if (result.success) {
        setCurrentCartId(result.cart_id);
        setCartData({
          cart_id: result.cart_id,
          items: [],
          total_amount: 0,
          item_count: 0,
          created_by_email: user.email || '',
          last_updated: new Date(),
          status: 'active'
        });
        
        return result;
      } else {
        throw new Error('Failed to create shared cart');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load a shared cart by ID
  const loadSharedCart = useCallback(async (cartId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiService.getSharedCart(cartId);
      
      if (result.success) {
        setCurrentCartId(cartId);
        setCartData({
          cart_id: result.cart_id,
          items: result.items,
          total_amount: result.total_amount,
          item_count: result.item_count,
          created_by_email: result.cart_data?.created_by_email || '',
          last_updated: result.cart_data?.last_updated,
          status: result.cart_data?.status || 'active'
        });
        
        return result;
      } else {
        throw new Error('Failed to load shared cart');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Add item to shared cart via barcode scan
  const addItemToSharedCart = useCallback(async (barcodeData: string) => {
    if (!user || !currentCartId) throw new Error('No active shared cart');
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiService.addItemToSharedCart(currentCartId, barcodeData);
      
      if (result.success) {
        // Update local cart data
        if (cartData) {
          setCartData(prev => prev ? {
            ...prev,
            items: [...prev.items, result.item],
            total_amount: result.cart_total,
            item_count: result.cart_item_count,
            last_updated: new Date()
          } : null);
        }
        
        return result;
      } else {
        throw new Error(result.message || 'Failed to add item to cart');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCartId, cartData]);

  // Refresh cart data (useful for syncing across devices)
  const refreshCartData = useCallback(async () => {
    if (!currentCartId) return;
    
    try {
      await loadSharedCart(currentCartId);
    } catch (err) {
      console.error('Failed to refresh cart data:', err);
    }
  }, [currentCartId, loadSharedCart]);

  // Get user's shared carts
  const getUserSharedCarts = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiService.getUserSharedCarts();
      
      if (result.success) {
        setUserCarts(result.carts);
        return result.carts;
      } else {
        throw new Error('Failed to get user shared carts');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Clear current cart
  const clearCurrentCart = useCallback(() => {
    setCurrentCartId(null);
    setCartData(null);
    setError(null);
  }, []);

  // Auto-refresh cart data every 10 seconds if there's an active cart
  useEffect(() => {
    if (!currentCartId) return;

    const interval = setInterval(refreshCartData, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [currentCartId, refreshCartData]);

  return {
    currentCartId,
    cartData,
    isLoading,
    error,
    userCarts,
    createSharedCart,
    loadSharedCart,
    addItemToSharedCart,
    refreshCartData,
    getUserSharedCarts,
    clearCurrentCart,
    // Computed values
    hasActiveCart: !!currentCartId && cartData?.status === 'active',
    cartItemCount: cartData?.item_count || 0,
    cartTotal: cartData?.total_amount || 0
  };
}; 