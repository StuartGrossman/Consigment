import React, { useState } from 'react';
import { ConsignmentItem } from '../types';

interface ItemCardProps {
  item: ConsignmentItem;
  isAdmin?: boolean;
  onMarkAsSold?: (item: ConsignmentItem, soldPrice: number) => Promise<void>;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isAdmin = false, onMarkAsSold }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [soldPrice, setSoldPrice] = useState(item.price.toString());

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === item.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? item.images.length - 1 : prev - 1
    );
  };

  const handleMarkAsSold = () => {
    setShowSoldModal(true);
  };

  const handleConfirmSold = async () => {
    if (!onMarkAsSold) return;
    
    const price = parseFloat(soldPrice);
    if (isNaN(price) || price <= 0) {
      return; // Don't proceed with invalid price
    }
    
    setIsMarkingSold(true);
    try {
      await onMarkAsSold(item, price);
      setShowSoldModal(false);
    } catch (error) {
      console.error('Error marking item as sold:', error);
    } finally {
      setIsMarkingSold(false);
    }
  };

  const handleCancelSold = () => {
    setShowSoldModal(false);
    setSoldPrice(item.price.toString());
  };

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
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
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-75 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
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
          
          {/* Admin Actions */}
          {isAdmin && item.status === 'live' && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={handleMarkAsSold}
                disabled={isMarkingSold}
                className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  isMarkingSold 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isMarkingSold ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Mark as Sold
                  </div>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mark as Sold Modal */}
      {showSoldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-orange-600 text-xl">💰</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Mark as Sold</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Mark "<span className="font-medium">{item.title}</span>" as sold
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Final Sale Price
              </label>
              <input
                type="number"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Enter sale price"
                min="0"
                step="0.01"
              />
              {soldPrice && parseFloat(soldPrice) <= 0 && (
                <p className="text-red-500 text-sm mt-1">Please enter a valid price greater than 0</p>
              )}
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelSold}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isMarkingSold}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSold}
                disabled={isMarkingSold || !soldPrice || parseFloat(soldPrice) <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isMarkingSold ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Updating...
                  </>
                ) : (
                  'Confirm Sale'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemCard; 