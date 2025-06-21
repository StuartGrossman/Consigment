import React from 'react';
import { ConsignmentItem } from '../types';
import { useCart } from '../hooks/useCart';

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConsignmentItem[];
  onItemClick: (item: ConsignmentItem) => void;
}

const BookmarksModal: React.FC<BookmarksModalProps> = ({ 
  isOpen, 
  onClose, 
  items, 
  onItemClick 
}) => {
  const { bookmarkedItems, toggleBookmark, addToCart } = useCart();

  // Filter items to only show bookmarked ones
  const bookmarkedItemsData = items.filter(item => bookmarkedItems.includes(item.id));

  if (!isOpen) return null;

  return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Bookmarked Items</h2>
              <p className="text-gray-600 mt-1">
                {bookmarkedItemsData.length} item{bookmarkedItemsData.length !== 1 ? 's' : ''} saved
              </p>
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

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {bookmarkedItemsData.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookmarked items</h3>
              <p className="text-gray-500">Items you bookmark will appear here for easy access.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bookmarkedItemsData.map((item) => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <div className="relative">
                    {item.images && item.images.length > 0 ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.title}
                        className="w-full h-48 object-cover rounded-t-lg cursor-pointer"
                        onClick={() => onItemClick(item)}
                      />
                    ) : (
                      <div 
                        className="w-full h-48 bg-gray-200 rounded-t-lg flex items-center justify-center cursor-pointer"
                        onClick={() => onItemClick(item)}
                      >
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    
                    {/* Bookmark button */}
                    <button
                      onClick={() => {
                        toggleBookmark(item.id);
                        console.log('Removed bookmark from bookmarks modal:', item.title);
                        // Show a brief success message
                        const toast = document.createElement('div');
                        toast.className = 'fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg';
                        toast.textContent = `Removed ${item.title} from bookmarks`;
                        document.body.appendChild(toast);
                        setTimeout(() => {
                          document.body.removeChild(toast);
                        }, 2000);
                      }}
                      className="absolute top-2 right-2 p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-colors"
                    >
                      <svg className="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="p-4">
                    <h3 
                      className="text-lg font-semibold text-gray-900 mb-2 cursor-pointer hover:text-orange-600 transition-colors"
                      onClick={() => onItemClick(item)}
                    >
                      {item.title}
                    </h3>
                    <p className="text-2xl font-bold text-orange-600 mb-3">${item.price}</p>
                    
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        item.status === 'live' ? 'bg-green-100 text-green-800' :
                        item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status === 'live' ? 'Available' :
                         item.status === 'approved' ? 'Approved' :
                         item.status}
                      </span>
                      <span className="text-sm text-gray-500">{item.category}</span>
                    </div>
                    
                    {item.status === 'live' && (
                      <button
                        onClick={() => {
                          addToCart(item);
                          console.log('Added to cart from bookmarks:', item.title);
                          // Show a brief success message
                          const toast = document.createElement('div');
                          toast.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg';
                          toast.textContent = `${item.title} added to cart!`;
                          document.body.appendChild(toast);
                          setTimeout(() => {
                            document.body.removeChild(toast);
                          }, 2000);
                        }}
                        className="w-full bg-orange-500 text-white py-2 px-4 rounded-lg hover:bg-orange-600 transition-colors font-medium"
                      >
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksModal; 