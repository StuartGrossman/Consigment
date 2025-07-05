import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface StoreCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoreCreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: any;
  relatedItemId?: string;
  refundReason?: string;
}

const StoreCreditModal: React.FC<StoreCreditModalProps> = ({ isOpen, onClose }) => {
  const [currentBalance, setCurrentBalance] = useState(0);
  const [transactions, setTransactions] = useState<StoreCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state when opening
      setCurrentBalance(0);
      setTransactions([]);
      setError(null);
      loadStoreCreditData();
    }
  }, [isOpen]);

  const loadStoreCreditData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getUserStoreCredit();
      
      if (data.success) {
        setCurrentBalance(data.currentBalance);
        setTransactions(data.transactions);
      } else {
        setError('Failed to load store credit data');
      }
    } catch (error) {
      console.error('Error loading store credit:', error);
      setError('Failed to load store credit data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'Unknown';
    try {
      let dateObj = date;
      if (date.toDate) {
        dateObj = date.toDate();
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      }
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'refund':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
        );
      case 'used':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 7H6l-1-7z" />
            </svg>
          </div>
        );
      case 'earned':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        );
    }
  };

  const getAmountColor = (type: string) => {
    switch (type) {
      case 'refund':
      case 'earned':
        return 'text-green-600';
      case 'used':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getAmountPrefix = (type: string) => {
    switch (type) {
      case 'refund':
      case 'earned':
        return '+';
      case 'used':
        return '-';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-800">Store Credit</h2>
              <p className="text-gray-600 mt-1">Your store credit balance and transaction history</p>
            </div>
            <button
              onClick={loadStoreCreditData}
              disabled={loading}
              className="mr-4 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              title="Refresh store credit data"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-2 text-gray-600">Loading store credit...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Store Credit</h3>
                <p className="text-red-600">{error}</p>
              </div>
              <button
                onClick={loadStoreCreditData}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Balance Card */}
              <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Current Balance</h3>
                    <p className="text-3xl font-bold text-green-900">${currentBalance.toFixed(2)}</p>
                    <p className="text-sm text-green-700 mt-1">Available for purchases</p>
                  </div>
                  <div className="w-16 h-16 bg-green-200 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Transaction History */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Transaction History</h3>
                
                {transactions.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No Transactions Yet</h4>
                    <p className="text-gray-500">Your store credit transactions will appear here when you receive refunds or use store credit.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((transaction) => (
                      <div key={transaction.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4">
                          {getTransactionIcon(transaction.type)}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {transaction.description}
                                </p>
                                {transaction.refundReason && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Reason: {transaction.refundReason}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {formatDate(transaction.createdAt)}
                                </p>
                              </div>
                              
                              <div className="text-right ml-4">
                                <p className={`text-lg font-semibold ${getAmountColor(transaction.type)}`}>
                                  {getAmountPrefix(transaction.type)}${Math.abs(transaction.amount).toFixed(2)}
                                </p>
                                <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                  transaction.type === 'refund' ? 'bg-green-100 text-green-800' :
                                  transaction.type === 'used' ? 'bg-red-100 text-red-800' :
                                  transaction.type === 'earned' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {transaction.type === 'refund' ? 'Refund' :
                                   transaction.type === 'used' ? 'Used' :
                                   transaction.type === 'earned' ? 'Earned' :
                                   transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreCreditModal; 