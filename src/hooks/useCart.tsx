import React, { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { ConsignmentItem, AuthUser } from '../types';
import { logUserActionSafe } from '../services/userService';
import { useFormSubmitThrottle } from './useButtonThrottle';

export interface CartItem {
  item: ConsignmentItem;
  quantity: number;
  addedAt: Date;
}

interface CartContextType {
  cartItems: CartItem[];
  bookmarkedItems: string[];
  addToCart: (item: ConsignmentItem, user?: AuthUser | null, quantity?: number) => void;
  removeFromCart: (itemId: string, user?: AuthUser | null) => void;
  updateQuantity: (itemId: string, newQuantity: number, user?: AuthUser | null) => void;
  clearCart: (user?: AuthUser | null) => void;
  isInCart: (itemId: string) => boolean;
  getCartItemQuantity: (itemId: string) => number;
  toggleBookmark: (itemId: string, user?: AuthUser | null) => void;
  isBookmarked: (itemId: string) => boolean;
  getCartTotal: () => number;
  getCartItemCount: () => number;
  getBookmarkCount: (availableItems?: ConsignmentItem[]) => number;
  cleanupBookmarks: (availableItems: ConsignmentItem[]) => void;
  switchUser: (userId: string | null) => void;
  // Throttling functions
  isCartActionDisabled: (actionId: string) => boolean;
  isCartActionProcessing: (actionId: string) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [bookmarkedItems, setBookmarkedItems] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Use refs to prevent unnecessary re-renders
  const isLoadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  
  // Button throttling hook for cart actions
  const { throttledAction, isActionDisabled, isActionProcessing } = useFormSubmitThrottle();

  // Helper function to get user-specific storage keys
  const getStorageKeys = useCallback((userId: string | null) => ({
    cart: userId ? `shopping_cart_${userId}` : 'shopping_cart_guest',
    bookmarks: userId ? `bookmarked_items_${userId}` : 'bookmarked_items_guest'
  }), []);

  // Load cart and bookmarks from localStorage when user changes
  const loadUserData = useCallback((userId: string | null) => {
    if (isLoadingRef.current || lastUserIdRef.current === userId) {
      return; // Prevent duplicate loads
    }
    
    isLoadingRef.current = true;
    lastUserIdRef.current = userId;
    
    const keys = getStorageKeys(userId);
    const savedCart = localStorage.getItem(keys.cart);
    const savedBookmarks = localStorage.getItem(keys.bookmarks);
    
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        // Convert addedAt back to Date objects
        const cartWithDates = parsed.map((cartItem: any) => ({
          ...cartItem,
          addedAt: new Date(cartItem.addedAt)
        }));
        setCartItems(cartWithDates);
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        setCartItems([]);
      }
    } else {
      setCartItems([]);
    }
    
    if (savedBookmarks) {
      try {
        const bookmarks = JSON.parse(savedBookmarks);
        setBookmarkedItems(bookmarks);
      } catch (error) {
        console.error('Error loading bookmarks from localStorage:', error);
        setBookmarkedItems([]);
      }
    } else {
      setBookmarkedItems([]);
    }
    
    isLoadingRef.current = false;
  }, [getStorageKeys]);

  // Initialize with guest data on mount
  useEffect(() => {
    if (!isInitialized) {
      loadUserData(null);
      setIsInitialized(true);
    }
  }, [loadUserData, isInitialized]);

  // Save cart to localStorage whenever it changes (with throttling)
  useEffect(() => {
    if (isInitialized && !isLoadingRef.current) {
      const keys = getStorageKeys(currentUserId);
      localStorage.setItem(keys.cart, JSON.stringify(cartItems));
    }
  }, [cartItems, isInitialized, currentUserId, getStorageKeys]);

  // Save bookmarks to localStorage whenever they change (with throttling)
  useEffect(() => {
    if (isInitialized && !isLoadingRef.current) {
      const keys = getStorageKeys(currentUserId);
      localStorage.setItem(keys.bookmarks, JSON.stringify(bookmarkedItems));
    }
  }, [bookmarkedItems, isInitialized, currentUserId, getStorageKeys]);

  // Function to switch user context (to be called when user logs in/out)
  const switchUser = useCallback((userId: string | null) => {
    if (currentUserId !== userId) {
      setCurrentUserId(userId);
      loadUserData(userId);
    }
  }, [currentUserId, loadUserData]);

  const addToCart = useCallback(async (item: ConsignmentItem, user?: AuthUser | null, quantity: number = 1) => {
    await throttledAction(`add-to-cart-${item.id}`, async () => {
      // Log the action
      if (user) {
        await logUserActionSafe(user, 'cart_updated', 'Added item to cart', item.id, item.title);
      }
      
      // Check if item is already in cart
      const existingItemIndex = cartItems.findIndex(cartItem => cartItem.item.id === item.id);
      
      if (existingItemIndex >= 0) {
        // For consignment items, don't increase quantity - they're unique items
        return;
      } else {
        // Add new item to cart with quantity 1 (consignment items are unique)
        const newCartItem: CartItem = {
          item,
          quantity: 1, // Always 1 for consignment items
          addedAt: new Date()
        };
        setCartItems(prev => [...prev, newCartItem]);
      }
    });
  }, [cartItems, throttledAction]);

  const removeFromCart = useCallback(async (itemId: string, user?: AuthUser | null) => {
    // Find the item being removed for logging
    const itemToRemove = cartItems.find(cartItem => cartItem.item.id === itemId);
    
    // Log the action
    if (user && itemToRemove) {
      await logUserActionSafe(user, 'cart_updated', 'Removed item from cart', itemToRemove.item.id, itemToRemove.item.title);
    }
    
    setCartItems(prev => prev.filter(cartItem => cartItem.item.id !== itemId));
  }, [cartItems]);

  const updateQuantity = useCallback(async (itemId: string, newQuantity: number, user?: AuthUser | null) => {
    if (newQuantity <= 0) {
      await removeFromCart(itemId, user);
      return;
    }
    
    // Find the item for logging
    const item = cartItems.find(cartItem => cartItem.item.id === itemId);
    
    // Log the action
    if (user && item) {
      await logUserActionSafe(user, 'cart_updated', `Updated item quantity to ${newQuantity}`, item.item.id, item.item.title);
    }
    
    setCartItems(prev => 
      prev.map(cartItem => 
        cartItem.item.id === itemId 
          ? { ...cartItem, quantity: newQuantity }
          : cartItem
      )
    );
  }, [cartItems, removeFromCart]);

  const clearCart = useCallback(async (user?: AuthUser | null) => {
    // Log the action
    if (user) {
      await logUserActionSafe(user, 'cart_updated', `Cleared cart with ${cartItems.length} items`);
    }
    
    setCartItems([]);
  }, [cartItems]);

  const isInCart = useCallback((itemId: string): boolean => {
    return cartItems.some(cartItem => cartItem.item.id === itemId);
  }, [cartItems]);

  const getCartItemQuantity = useCallback((itemId: string): number => {
    const cartItem = cartItems.find(cartItem => cartItem.item.id === itemId);
    return cartItem?.quantity || 0;
  }, [cartItems]);

  const toggleBookmark = useCallback(async (itemId: string, user?: AuthUser | null) => {
    const isCurrentlyBookmarked = bookmarkedItems.includes(itemId);
    
    // Log the action
    if (user) {
      await logUserActionSafe(user, 'item_bookmarked', isCurrentlyBookmarked ? 'Removed bookmark' : 'Added bookmark', itemId);
    }
    
    setBookmarkedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  }, [bookmarkedItems]);

  const isBookmarked = useCallback((itemId: string): boolean => {
    return bookmarkedItems.includes(itemId);
  }, [bookmarkedItems]);

  const getCartTotal = useCallback((): number => {
    return cartItems.reduce((total, cartItem) => {
      return total + (cartItem.item.price * cartItem.quantity);
    }, 0);
  }, [cartItems]);

  const getCartItemCount = useCallback((): number => {
    return cartItems.reduce((total, cartItem) => total + cartItem.quantity, 0);
  }, [cartItems]);

  const getBookmarkCount = useCallback((availableItems?: ConsignmentItem[]): number => {
    if (availableItems) {
      return bookmarkedItems.filter(itemId => availableItems.some(item => item.id === itemId)).length;
    } else {
      return bookmarkedItems.length;
    }
  }, [bookmarkedItems]);

  const cleanupBookmarks = useCallback((availableItems: ConsignmentItem[]): void => {
    setBookmarkedItems(prev => prev.filter(itemId => availableItems.some(item => item.id === itemId)));
  }, []);

  const value: CartContextType = {
    cartItems,
    bookmarkedItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    isInCart,
    getCartItemQuantity,
    toggleBookmark,
    isBookmarked,
    getCartTotal,
    getCartItemCount,
    getBookmarkCount,
    cleanupBookmarks,
    switchUser,
    isCartActionDisabled: isActionDisabled,
    isCartActionProcessing: isActionProcessing
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}; 