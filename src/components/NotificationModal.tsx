import React from 'react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  showIcon?: boolean;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type,
  showIcon = true
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          button: 'bg-green-600 hover:bg-green-700'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          button: 'bg-red-600 hover:bg-red-700'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          button: 'bg-yellow-600 hover:bg-yellow-700'
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          button: 'bg-blue-600 hover:bg-blue-700'
        };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${colors.bg} ${colors.border} border-2 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
        <div className="flex items-start space-x-3">
          {showIcon && (
            <div className="text-2xl flex-shrink-0">
              {getIcon()}
            </div>
          )}
          <div className="flex-1">
            <h3 className={`${colors.text} text-lg font-semibold mb-2`}>
              {title}
            </h3>
            <p className={`${colors.text} text-sm whitespace-pre-wrap`}>
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className={`${colors.button} text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal; 