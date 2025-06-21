import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { ConsignmentItem, AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';
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
  getBookmarkCount: () => number;
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
  
  // Button throttling hook for cart actions
  const { throttledAction, isActionDisabled, isActionProcessing } = useFormSubmitThrottle();

  // Helper function to get user-specific storage keys
  const getStorageKeys = (userId: string | null) => ({
    cart: userId ? `shopping_cart_${userId}` : 'shopping_cart_guest',
    bookmarks: userId ? `bookmarked_items_${userId}` : 'bookmarked_items_guest'
  });

  // Load cart and bookmarks from localStorage when user changes
  const loadUserData = (userId: string | null) => {
    console.log('Loading cart and bookmarks for user:', userId);
    const keys = getStorageKeys(userId);
    const savedCart = localStorage.getItem(keys.cart);
    const savedBookmarks = localStorage.getItem(keys.bookmarks);
    
    console.log('Saved cart:', savedCart);
    console.log('Saved bookmarks:', savedBookmarks);
    
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        // Convert addedAt back to Date objects
        const cartWithDates = parsed.map((cartItem: any) => ({
          ...cartItem,
          addedAt: new Date(cartItem.addedAt)
        }));
        console.log('Loaded cart items:', cartWithDates.length);
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
        console.log('Loaded bookmarks:', bookmarks.length);
        setBookmarkedItems(bookmarks);
      } catch (error) {
        console.error('Error loading bookmarks from localStorage:', error);
        setBookmarkedItems([]);
      }
    } else {
      setBookmarkedItems([]);
    }
  };

  // Initialize with guest data on mount
  useEffect(() => {
    loadUserData(null);
    setIsInitialized(true);
  }, []);

  // Save cart to localStorage whenever it changes (but not during initial load)
  useEffect(() => {
    if (isInitialized && currentUserId !== undefined) {
      const keys = getStorageKeys(currentUserId);
      console.log('Saving cart to localStorage:', cartItems.length, 'items for user:', currentUserId);
      localStorage.setItem(keys.cart, JSON.stringify(cartItems));
    }
  }, [cartItems, isInitialized, currentUserId]);

  // Save bookmarks to localStorage whenever they change (but not during initial load)
  useEffect(() => {
    if (isInitialized && currentUserId !== undefined) {
      const keys = getStorageKeys(currentUserId);
      console.log('Saving bookmarks to localStorage:', bookmarkedItems.length, 'items for user:', currentUserId);
      localStorage.setItem(keys.bookmarks, JSON.stringify(bookmarkedItems));
    }
  }, [bookmarkedItems, isInitialized, currentUserId]);

  // Function to switch user context (to be called when user logs in/out)
  const switchUser = (userId: string | null) => {
    console.log('Switching user context from', currentUserId, 'to', userId);
    setCurrentUserId(userId);
    loadUserData(userId);
  };

  const addToCart = async (item: ConsignmentItem, user?: AuthUser | null, quantity: number = 1) => {
    await throttledAction(`add-to-cart-${item.id}`, async () => {
      console.log('addToCart called:', item.title, 'Current cart size:', cartItems.length);
      
      // Log the action
      if (user) {
        await logUserAction(user, 'cart_updated', 'Added item to cart', item.id, item.title);
      }
      
      // Check if item is already in cart
      const existingItemIndex = cartItems.findIndex(cartItem => cartItem.item.id === item.id);
      
      if (existingItemIndex >= 0) {
        // For consignment items, don't increase quantity - they're unique items
        console.log('Item already in cart, not adding again (consignment items are unique)');
        return;
      } else {
        // Add new item to cart with quantity 1 (consignment items are unique)
        const newCartItem: CartItem = {
          item,
          quantity: 1, // Always 1 for consignment items
          addedAt: new Date()
        };
        console.log('Adding new item to cart:', newCartItem);
        setCartItems(prev => {
          const newCart = [...prev, newCartItem];
          console.log('New cart size will be:', newCart.length);
          return newCart;
        });
      }
    });
  };

  const removeFromCart = async (itemId: string, user?: AuthUser | null) => {
    // Find the item being removed for logging
    const itemToRemove = cartItems.find(cartItem => cartItem.item.id === itemId);
    
    // Log the action
    if (user && itemToRemove) {
      await logUserAction(user, 'cart_updated', 'Removed item from cart', itemToRemove.item.id, itemToRemove.item.title);
    }
    
    setCartItems(prev => prev.filter(cartItem => cartItem.item.id !== itemId));
  };

  const updateQuantity = async (itemId: string, newQuantity: number, user?: AuthUser | null) => {
    if (newQuantity <= 0) {
      await removeFromCart(itemId, user);
      return;
    }
    
    // Find the item for logging
    const item = cartItems.find(cartItem => cartItem.item.id === itemId);
    
    // Log the action
    if (user && item) {
      await logUserAction(user, 'cart_updated', `Updated item quantity to ${newQuantity}`, item.item.id, item.item.title);
    }
    
    setCartItems(prev => 
      prev.map(cartItem => 
        cartItem.item.id === itemId 
          ? { ...cartItem, quantity: newQuantity }
          : cartItem
      )
    );
  };

  const clearCart = async (user?: AuthUser | null) => {
    // Log the action
    if (user) {
      await logUserAction(user, 'cart_updated', `Cleared cart with ${cartItems.length} items`);
    }
    
    setCartItems([]);
  };

  const isInCart = (itemId: string): boolean => {
    return cartItems.some(cartItem => cartItem.item.id === itemId);
  };

  const getCartItemQuantity = (itemId: string): number => {
    const cartItem = cartItems.find(cartItem => cartItem.item.id === itemId);
    return cartItem?.quantity || 0;
  };

  const toggleBookmark = async (itemId: string, user?: AuthUser | null) => {
    console.log('toggleBookmark called:', itemId, 'Current bookmarks:', bookmarkedItems.length);
    
    const isCurrentlyBookmarked = bookmarkedItems.includes(itemId);
    
    // Log the action
    if (user) {
      await logUserAction(user, 'item_bookmarked', isCurrentlyBookmarked ? 'Removed bookmark' : 'Added bookmark', itemId);
    }
    
    setBookmarkedItems(prev => {
      if (prev.includes(itemId)) {
        const newBookmarks = prev.filter(id => id !== itemId);
        console.log('Removed bookmark, new count:', newBookmarks.length);
        return newBookmarks;
      } else {
        const newBookmarks = [...prev, itemId];
        console.log('Added bookmark, new count:', newBookmarks.length);
        return newBookmarks;
      }
    });
  };

  const isBookmarked = (itemId: string): boolean => {
    return bookmarkedItems.includes(itemId);
  };

  const getCartTotal = (): number => {
    return cartItems.reduce((total, cartItem) => {
      return total + (cartItem.item.price * cartItem.quantity);
    }, 0);
  };

  const getCartItemCount = (): number => {
    return cartItems.reduce((total, cartItem) => total + cartItem.quantity, 0);
  };

  const getBookmarkCount = (): number => {
    return bookmarkedItems.length;
  };

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