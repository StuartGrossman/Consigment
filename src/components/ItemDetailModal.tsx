import React, { useEffect } from 'react';
import { ConsignmentItem } from '../types';
import { useCart } from '../hooks/useCart';

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ConsignmentItem | null;
}

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ isOpen, onClose, item }) => {
  const { 
    addToCart, 
    isInCart, 
    getCartItemQuantity, 
    toggleBookmark, 
    isBookmarked,
    cartItems,
    bookmarkedItems 
  } = useCart();

  // Debug bookmark state changes
  useEffect(() => {
    if (item) {
      console.log('Bookmark state check for', item.title, '- Bookmarked:', isBookmarked(item.id));
      console.log('Total bookmarked items:', bookmarkedItems.length);
    }
  }, [bookmarkedItems, item, isBookmarked]);

  if (!isOpen || !item) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'approved': return 'Approved';
      case 'live': return 'Live';
      case 'sold': return 'Sold';
      default: return status;
    }
  };

  const handleAddToCart = () => {
    console.log('Before adding to cart - Cart items count:', cartItems.length);
    console.log('Item being added:', item.title, 'ID:', item.id);
    console.log('Is item already in cart?', isInCart(item.id));
    console.log('Current cart quantity for this item:', getCartItemQuantity(item.id));
    
    addToCart(item);
    
    // Show a brief success message
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
    toast.textContent = `${item.title} added to cart!`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 2000);
  };

  const handleBookmarkToggle = () => {
    const wasBookmarked = isBookmarked(item.id);
    console.log('Before bookmark toggle - Item ID:', item.id, 'Was bookmarked:', wasBookmarked);
    console.log('Current bookmarked items count:', bookmarkedItems.length);
    
    toggleBookmark(item.id);
    
    // Show a brief success message
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg';
    toast.textContent = wasBookmarked ? `Removed ${item.title} from bookmarks` : `${item.title} bookmarked!`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 2000);
  };

  const canPurchase = item.status === 'live';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{item.title}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                  {getStatusText(item.status)}
                </span>
                <span className="text-2xl font-bold text-orange-600">${item.price}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Item Images */}
          {item.images && item.images.length > 0 && (
            <div className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {item.images.slice(0, 4).map((image, index) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img 
                      src={image} 
                      alt={`${item.title} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {item.images.length > 4 && (
                <p className="text-sm text-gray-500 mt-2">
                  +{item.images.length - 4} more images
                </p>
              )}
            </div>
          )}

          {/* Item Details */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{item.description}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-gray-800">Category</h4>
                <p className="text-gray-600">{item.category}</p>
              </div>
              
              {item.brand && (
                <div>
                  <h4 className="font-medium text-gray-800">Brand</h4>
                  <p className="text-gray-600">{item.brand}</p>
                </div>
              )}
              
              {item.size && (
                <div>
                  <h4 className="font-medium text-gray-800">Size</h4>
                  <p className="text-gray-600">{item.size}</p>
                </div>
              )}
              
              {item.color && (
                <div>
                  <h4 className="font-medium text-gray-800">Color</h4>
                  <p className="text-gray-600">{item.color}</p>
                </div>
              )}
              
              {item.condition && (
                <div>
                  <h4 className="font-medium text-gray-800">Condition</h4>
                  <p className="text-gray-600">{item.condition}</p>
                </div>
              )}
              
              {item.gender && (
                <div>
                  <h4 className="font-medium text-gray-800">Gender</h4>
                  <p className="text-gray-600">{item.gender}</p>
                </div>
              )}
            </div>


          </div>
        </div>

        {/* Action Buttons - Only show for live items */}
        {canPurchase && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
            <div className="flex gap-3">
              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkToggle}
                className={`flex-shrink-0 p-3 rounded-lg border-2 transition-all duration-200 ${
                  isBookmarked(item.id)
                    ? 'border-red-500 bg-red-50 text-red-600'
                    : 'border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-500'
                }`}
                title={isBookmarked(item.id) ? 'Remove from bookmarks' : 'Add to bookmarks'}
              >
                <svg className="w-6 h-6" fill={isBookmarked(item.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                  isInCart(item.id)
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                } flex items-center justify-center gap-2`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.8 7.2M7 13l-1.8 7.2M7 13h10m0 0v8a2 2 0 01-2 2H9a2 2 0 01-2-2v-8m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                </svg>
                {isInCart(item.id) ? (
                  <span>In Cart ({getCartItemQuantity(item.id)})</span>
                ) : (
                  <span>Add to Cart - ${item.price}</span>
                )}
              </button>
            </div>

            {/* Purchase Info */}
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">
                ✓ Secure checkout with Stripe • ✓ Quality guaranteed • ✓ Local pickup available
              </p>
            </div>
          </div>
        )}

        {/* Status Message for Non-Live Items */}
        {!canPurchase && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
            <div className="text-center">
              <p className="text-gray-600 font-medium">
                {item.status === 'pending' && 'This item is currently under review'}
                {item.status === 'approved' && 'This item is approved and will be available soon'}
                {item.status === 'sold' && 'This item has been sold'}
                {item.status === 'archived' && 'This item is no longer available'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Check back later or browse our other available items
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemDetailModal; 