import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface BulkAction {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface BulkActionProgress {
  itemId: string;
  itemTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface BulkActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: string[];
  availableActions: BulkAction[];
  onComplete: () => void;
}

const BulkActionsModal: React.FC<BulkActionsModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedItems, 
  availableActions,
  onComplete 
}) => {
  const [selectedAction, setSelectedAction] = useState<BulkAction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BulkActionProgress[]>([]);
  const [currentStep, setCurrentStep] = useState<'selection' | 'processing' | 'completed'>('selection');
  const [currentIndex, setCurrentIndex] = useState(0);

  const initializeProgress = (items: string[]) => {
    const initialProgress: BulkActionProgress[] = items.map(itemId => ({
      itemId,
      itemTitle: `Item ${itemId.slice(-8)}`, // Show last 8 chars as fallback
      status: 'pending'
    }));
    setProgress(initialProgress);
  };

  const startBulkAction = async (action: BulkAction) => {
    setSelectedAction(action);
    setCurrentStep('processing');
    setIsProcessing(true);
    initializeProgress(selectedItems);

    for (let i = 0; i < selectedItems.length; i++) {
      setCurrentIndex(i);
      await processItem(selectedItems[i], action, i);
    }

    setCurrentStep('completed');
    setIsProcessing(false);
  };

  const processItem = async (itemId: string, action: BulkAction, index: number) => {
    // Update status to processing
    setProgress(prev => prev.map((item, i) => 
      i === index ? { ...item, status: 'processing' } : item
    ));

    try {
      let result;
      switch (action.id) {
        case 'approve':
          result = await apiService.bulkUpdateItemStatus([itemId], 'approved');
          break;
        case 'reject':
          result = await apiService.bulkUpdateItemStatus([itemId], 'rejected');
          break;
        case 'archive':
          result = await apiService.bulkUpdateItemStatus([itemId], 'archived');
          break;
        case 'make-live':
          result = await apiService.bulkUpdateItemStatus([itemId], 'live');
          break;
        default:
          throw new Error(`Unknown action: ${action.id}`);
      }

      // Update status to completed
      setProgress(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'completed' } : item
      ));

    } catch (error) {
      console.error(`Error processing item ${itemId}:`, error);
      setProgress(prev => prev.map((item, i) => 
        i === index ? { 
          ...item, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error'
        } : item
      ));
    }

    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  const resetModal = () => {
    setSelectedAction(null);
    setIsProcessing(false);
    setProgress([]);
    setCurrentStep('selection');
    setCurrentIndex(0);
  };

  const handleClose = () => {
    if (!isProcessing) {
      resetModal();
      onClose();
    }
  };

  if (!isOpen) return null;

  const completedCount = progress.filter(item => item.status === 'completed').length;
  const errorCount = progress.filter(item => item.status === 'error').length;
  const progressPercentage = progress.length > 0 ? (completedCount / progress.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Bulk Actions</h2>
              <p className="text-gray-600 mt-1">
                {currentStep === 'selection' && `Select an action for ${selectedItems.length} items`}
                {currentStep === 'processing' && `Processing ${currentIndex + 1} of ${selectedItems.length} items...`}
                {currentStep === 'completed' && `Completed: ${completedCount} successful, ${errorCount} failed`}
              </p>
            </div>
            {!isProcessing && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {/* Action Selection */}
          {currentStep === 'selection' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Choose an action:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => startBulkAction(action)}
                    className={`p-4 border-2 border-gray-200 rounded-lg hover:border-${action.color}-300 hover:bg-${action.color}-50 transition-all text-left`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{action.icon}</span>
                      <div>
                        <h4 className="font-medium text-gray-900">{action.name}</h4>
                        <p className="text-sm text-gray-600">{action.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {currentStep === 'processing' && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Overall Progress</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Progress List */}
          {(currentStep === 'processing' || currentStep === 'completed') && (
            <div className="max-h-96 overflow-y-auto space-y-3">
              {progress.map((item, index) => (
                <div
                  key={item.itemId}
                  className={`flex items-center p-4 rounded-lg border-2 transition-all ${
                    item.status === 'completed' ? 'border-green-200 bg-green-50' :
                    item.status === 'error' ? 'border-red-200 bg-red-50' :
                    item.status === 'processing' ? 'border-blue-200 bg-blue-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0 mr-4">
                    {item.status === 'completed' && (
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                    {item.status === 'processing' && (
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                    )}
                    {item.status === 'pending' && (
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow">
                    <h4 className="font-medium text-gray-900">{item.itemTitle}</h4>
                    <p className="text-sm text-gray-600">ID: {item.itemId}</p>
                    <div className="text-sm mt-1">
                      {item.status === 'pending' && <span className="text-gray-500">Waiting...</span>}
                      {item.status === 'processing' && <span className="text-blue-600">Processing {selectedAction?.name}...</span>}
                      {item.status === 'completed' && <span className="text-green-600">✓ {selectedAction?.name} completed</span>}
                      {item.status === 'error' && <span className="text-red-600">✗ Error: {item.error}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-between">
            <div>
              {currentStep === 'completed' && (
                <div className="text-sm text-gray-600">
                  <p>Action completed: {completedCount} successful, {errorCount} failed</p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {currentStep === 'selection' && (
                <button
                  onClick={handleClose}
                  className="px-6 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              )}
              {currentStep === 'processing' && (
                <div className="text-sm text-gray-600 flex items-center">
                  <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing items...
                </div>
              )}
              {currentStep === 'completed' && (
                <button
                  onClick={handleComplete}
                  className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsModal; 