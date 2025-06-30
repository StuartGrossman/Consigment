import React, { useState } from 'react';
import { ConsignmentItem } from '../types';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';

interface ItemCardProps {
  item: ConsignmentItem;
  isAdmin?: boolean;
  onClick?: (item: ConsignmentItem) => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isAdmin = false, onClick }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { addToCart, removeFromCart, isInCart, getCartItemQuantity, isCartActionDisabled, isCartActionProcessing, toggleBookmark, isBookmarked } = useCart();
  const { user } = useAuth();

  // Safely handle images property - provide empty array if undefined
  const images = item.images || [];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(item);
    }
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCartAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInCart(item.id)) {
      await removeFromCart(item.id, user);
    } else {
      await addToCart(item, user);
    }
  };

  const handleBookmarkAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleBookmark(item.id, user);
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Image Section */}
      <div className="relative h-48 bg-gray-200">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => { stopPropagation(e); prevImage(); }}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-75 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { stopPropagation(e); nextImage(); }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-75 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                  {images.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full ${
                        index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No Image Available</p>
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-4">
        <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
          {item.title}
        </h3>
        <p className="text-gray-600 text-sm mb-3 line-clamp-3">
          {item.description}
        </p>

        {/* Item Details */}
        {(item.category || item.brand || item.size || item.condition || item.color) && (
          <div className="mb-3 p-2 bg-gray-50 rounded-md">
            <div className="flex flex-wrap gap-2 text-xs">
              {item.category && (
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{item.category}</span>
              )}
              {item.brand && (
                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full">{item.brand}</span>
              )}
              {item.size && (
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">Size {item.size}</span>
              )}
              {item.condition && (
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full">{item.condition}</span>
              )}
              {item.gender && (
                <span className="bg-pink-100 text-pink-800 px-2 py-1 rounded-full">{item.gender}</span>
              )}
              {item.color && (
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">{item.color}</span>
              )}
            </div>
          </div>
        )}
        
        <div className="text-2xl font-bold text-green-600">
          ${item.price.toFixed(2)}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-3">
            <span>Listed {new Date(item.createdAt).toLocaleDateString()}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              item.status === 'live' ? 'bg-green-100 text-green-800' :
              item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
              item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {item.status}
            </span>
          </div>
          
          {/* Action Buttons - Only show for live items and non-admin users, and not for own items */}
          {!isAdmin && item.status === 'live' && user?.uid !== item.sellerId && (
            <div className="flex gap-2">
              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkAction}
                disabled={isCartActionDisabled(`bookmark-action-${item.id}`)}
                className={`flex-shrink-0 py-2 px-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center ${
                  isBookmarked(item.id)
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isBookmarked(item.id) ? 'Remove from Bookmarks' : 'Add to Bookmarks'}
              >
                <svg className="w-4 h-4" fill={isBookmarked(item.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
              
              {/* Cart Button */}
              <button
                onClick={handleCartAction}
                disabled={isCartActionDisabled(`cart-action-${item.id}`)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  isInCart(item.id)
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                </svg>
                {isCartActionProcessing(`cart-action-${item.id}`) ? (
                  <span>Processing...</span>
                ) : isInCart(item.id) ? (
                  <span>Remove</span>
                ) : (
                  <span>Add to Cart</span>
                )}
              </button>
            </div>
          )}
          
          {/* Message for own items */}
          {!isAdmin && item.status === 'live' && user?.uid === item.sellerId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-sm text-blue-700 font-medium">This is your listing</p>
              <p className="text-xs text-blue-600">You cannot purchase your own items</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemCard; 