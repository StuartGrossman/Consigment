import { useState } from 'react';
import { AddModal } from './AddModal';
import POSModal from './POSModal';

export const Navbar = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPOSModalOpen, setIsPOSModalOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center items-center h-16 space-x-4">
          {/* Add Item Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full transition-all duration-200"
            title="Add New Item"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>

          {/* Scan/POS Button */}
          <button
            onClick={() => setIsPOSModalOpen(true)}
            className="p-2 text-orange-600 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded-full transition-all duration-200 bg-orange-50 hover:bg-orange-100"
            title="Scan Items (POS)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Modals */}
      <AddModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <POSModal isOpen={isPOSModalOpen} onClose={() => setIsPOSModalOpen(false)} />
    </nav>
  );
}; 