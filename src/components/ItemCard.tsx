import React, { useState } from 'react';
import { ConsignmentItem } from '../types';

interface ItemCardProps {
  item: ConsignmentItem;
  isAdmin?: boolean;
  onClick?: (item: ConsignmentItem) => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isAdmin = false, onClick }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % item.images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + item.images.length) % item.images.length);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(item);
    }
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Image Section */}
      <div className="relative h-48 bg-gray-200">
        {item.images.length > 0 ? (
          <>
            <img
              src={item.images[currentImageIndex]}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            {item.images.length > 1 && (
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
                  {item.images.map((_, index) => (
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
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
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
        
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold text-green-600">
            ${item.price.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            by {item.sellerName}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs text-gray-400">
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
        </div>
      </div>
    </div>
  );
};

export default ItemCard; 