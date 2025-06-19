import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { ConsignmentItem } from '../types';

export interface CartItem {
  item: ConsignmentItem;
  quantity: number;
  addedAt: Date;
}

interface CartContextType {
  cartItems: CartItem[];
  bookmarkedItems: string[];
  addToCart: (item: ConsignmentItem, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, newQuantity: number) => void;
  clearCart: () => void;
  isInCart: (itemId: string) => boolean;
  getCartItemQuantity: (itemId: string) => number;
  toggleBookmark: (itemId: string) => void;
  isBookmarked: (itemId: string) => boolean;
  getCartTotal: () => number;
  getCartItemCount: () => number;
  getBookmarkCount: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [bookmarkedItems, setBookmarkedItems] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load cart and bookmarks from localStorage on mount
  useEffect(() => {
    console.log('Loading cart and bookmarks from localStorage...');
    const savedCart = localStorage.getItem('shopping_cart');
    const savedBookmarks = localStorage.getItem('bookmarked_items');
    
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
      }
    }
    
    if (savedBookmarks) {
      try {
        const bookmarks = JSON.parse(savedBookmarks);
        console.log('Loaded bookmarks:', bookmarks.length);
        setBookmarkedItems(bookmarks);
      } catch (error) {
        console.error('Error loading bookmarks from localStorage:', error);
      }
    }
    
    setIsInitialized(true);
  }, []);

  // Save cart to localStorage whenever it changes (but not during initial load)
  useEffect(() => {
    if (isInitialized) {
      console.log('Saving cart to localStorage:', cartItems.length, 'items');
      localStorage.setItem('shopping_cart', JSON.stringify(cartItems));
    }
  }, [cartItems, isInitialized]);

  // Save bookmarks to localStorage whenever they change (but not during initial load)
  useEffect(() => {
    if (isInitialized) {
      console.log('Saving bookmarks to localStorage:', bookmarkedItems.length, 'items');
      localStorage.setItem('bookmarked_items', JSON.stringify(bookmarkedItems));
    }
  }, [bookmarkedItems, isInitialized]);

  const addToCart = (item: ConsignmentItem, quantity: number = 1) => {
    console.log('addToCart called:', item.title, 'Current cart size:', cartItems.length);
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
  };

  const removeFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(cartItem => cartItem.item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    
    setCartItems(prev => 
      prev.map(cartItem => 
        cartItem.item.id === itemId 
          ? { ...cartItem, quantity: newQuantity }
          : cartItem
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const isInCart = (itemId: string): boolean => {
    return cartItems.some(cartItem => cartItem.item.id === itemId);
  };

  const getCartItemQuantity = (itemId: string): number => {
    const cartItem = cartItems.find(cartItem => cartItem.item.id === itemId);
    return cartItem?.quantity || 0;
  };

  const toggleBookmark = (itemId: string) => {
    console.log('toggleBookmark called:', itemId, 'Current bookmarks:', bookmarkedItems.length);
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
    getBookmarkCount
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