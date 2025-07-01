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
  const [isHovered, setIsHovered] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
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

  // Get available tags
  const tags: Array<{ label: string; color: string }> = [];
  if (item.category) tags.push({ label: item.category, color: 'bg-blue-50 text-blue-700 border-blue-100' });
  if (item.brand) tags.push({ label: item.brand, color: 'bg-purple-50 text-purple-700 border-purple-100' });
  if (item.size) tags.push({ label: item.size, color: 'bg-green-50 text-green-700 border-green-100' });
  if (item.condition) tags.push({ label: item.condition, color: 'bg-orange-50 text-orange-700 border-orange-100' });
  if (item.color) tags.push({ label: item.color, color: 'bg-red-50 text-red-700 border-red-100' });

  const visibleTags = showAllTags ? tags : tags.slice(0, 2);
  const hasMoreTags = tags.length > 2;

  return (
    <div 
      className="group relative bg-white rounded-2xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer border border-gray-100 hover:border-gray-200 h-full flex flex-col"
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Section - Main Focus */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            
            {/* Image Navigation - Only show on hover */}
            {images.length > 1 && isHovered && (
              <>
                <button
                  onClick={(e) => { stopPropagation(e); prevImage(); }}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 bg-white/90 text-gray-800 rounded-full p-2 hover:bg-white transition-all duration-200 shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { stopPropagation(e); nextImage(); }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-white/90 text-gray-800 rounded-full p-2 hover:bg-white transition-all duration-200 shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                {/* Image Dots */}
                <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1">
                  {images.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-all duration-200 ${
                        index === currentImageIndex ? 'bg-white shadow-md' : 'bg-white/60'
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
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-400">No Image</p>
            </div>
          </div>
        )}




      </div>

      {/* Content Section */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Price - Prominent Display */}
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-green-600">
            ${item.price.toFixed(2)}
          </div>
          {item.discountPercentage && (
            <div className="text-right">
              <div className="text-sm text-gray-400 line-through">${item.originalPrice}</div>
              <div className="text-xs text-red-600 font-medium">-{item.discountPercentage}%</div>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 leading-tight">
          {item.title}
        </h3>

        {/* Short Description */}
        <p className="text-gray-600 text-sm line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Tags - Collapsed by default with expand option */}
        {tags.length > 0 && (
          <div className={`transition-all duration-300 ${isHovered ? 'opacity-100' : 'opacity-70'}`}>
            <div className="flex flex-wrap gap-1.5 items-center">
              {visibleTags.map((tag, index) => (
                <span
                  key={index}
                  className={`${tag.color} px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0`}
                >
                  {tag.label}
                </span>
              ))}
              
              {hasMoreTags && !showAllTags && (
                <button
                  onClick={(e) => {
                    stopPropagation(e);
                    setShowAllTags(true);
                  }}
                  className="bg-gray-50 text-gray-600 hover:bg-gray-100 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 flex-shrink-0 transition-colors"
                >
                  +{tags.length - 2}
                </button>
              )}
              
              {showAllTags && hasMoreTags && (
                <button
                  onClick={(e) => {
                    stopPropagation(e);
                    setShowAllTags(false);
                  }}
                  className="bg-gray-50 text-gray-600 hover:bg-gray-100 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 flex-shrink-0 transition-colors"
                >
                  −
                </button>
              )}
            </div>
          </div>
        )}

        {/* Spacer to push action buttons to bottom */}
        <div className="flex-1"></div>

        {/* Action Buttons - Show on hover at bottom of card */}
        {!isAdmin && item.status === 'live' && user?.uid !== item.sellerId && (
          <div className={`transition-all duration-300 transform ${
            isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          } mt-4 mb-2`}>
            <div className="flex gap-2">
              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkAction}
                disabled={isCartActionDisabled(`bookmark-action-${item.id}`)}
                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  isBookmarked(item.id)
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isBookmarked(item.id) ? 'Remove from Bookmarks' : 'Add to Bookmarks'}
              >
                <svg className="w-4 h-4" fill={isBookmarked(item.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="text-xs">Save</span>
              </button>
              
              {/* Add to Cart Button */}
              <button
                onClick={handleCartAction}
                disabled={isCartActionDisabled(`cart-action-${item.id}`)}
                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  isInCart(item.id)
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isInCart(item.id) ? 'Remove from Cart' : 'Add to Cart'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
                </svg>
                <span className="text-xs">
                  {isCartActionProcessing(`cart-action-${item.id}`) ? 'Adding...' : 
                   isInCart(item.id) ? 'Remove' : 'Add'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Info */}
        {!isHovered && (
          <div className="flex justify-between items-center text-xs text-gray-400 pt-2 border-t border-gray-100 mt-auto">
            <span>Listed {new Date(item.createdAt).toLocaleDateString()}</span>
            <span>{item.sellerName}</span>
          </div>
        )}
        
        {/* Message for own items */}
        {!isAdmin && item.status === 'live' && user?.uid === item.sellerId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-sm text-blue-700 font-medium">Your Listing</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemCard; 