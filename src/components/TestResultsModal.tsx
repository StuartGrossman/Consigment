import React, { useState, useEffect } from 'react';
import { useButtonThrottle } from '../hooks/useButtonThrottle';

interface TestResult {
  test_name: string;
  status: 'passed' | 'failed' | 'error';
  duration: number;
  error_message?: string;
}

interface TestSummary {
  total_tests: number;
  passed: number;
  failed: number;
  errors: number;
  duration: number;
  coverage_percentage?: number;
  test_details: TestResult[];
  timestamp: string;
}

interface TestResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TestResultsModal: React.FC<TestResultsModalProps> = ({ isOpen, onClose }) => {
  const [testResults, setTestResults] = useState<TestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);
  
  const { throttledAction, isActionDisabled } = useButtonThrottle({
    delay: 3000,
    preventDoubleClick: true
  });

  const runTests = async () => {
    await throttledAction('run-tests', async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch('http://localhost:8000/api/run-tests');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: TestSummary = await response.json();
        setTestResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run tests');
      } finally {
        setLoading(false);
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'error': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'error': return '⚠️';
      default: return '❓';
    }
  };

  const formatDuration = (duration: number) => {
    return `${(duration * 1000).toFixed(0)}ms`;
  };

  const getSuccessRate = () => {
    if (!testResults || testResults.total_tests === 0) return 0;
    return Math.round((testResults.passed / testResults.total_tests) * 100);
  };

  const exportResults = () => {
    if (!testResults) return;
    
    const dataStr = JSON.stringify(testResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-results-${testResults.timestamp.replace(/[:\s]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Test Results Dashboard</h2>
            <p className="text-gray-600">Comprehensive application testing</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={runTests}
            disabled={isActionDisabled('run-tests') || loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Running Tests...
              </>
            ) : (
              <>
                <span>🧪</span>
                Run Tests
              </>
            )}
          </button>
          
          {testResults && (
            <button
              onClick={exportResults}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center gap-2"
            >
              <span>📄</span>
              Export Results
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results Display */}
        {testResults && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[60vh] overflow-auto">
            {/* Summary Stats */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{testResults.total_tests}</div>
                  <div className="text-sm text-gray-600">Total Tests</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{testResults.passed}</div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{testResults.failed}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{testResults.errors}</div>
                  <div className="text-sm text-gray-600">Errors</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{getSuccessRate()}%</div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Test Progress</span>
                  <span>{formatDuration(testResults.duration)} total</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${getSuccessRate()}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Test Details */}
            <div className="lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Test Details</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {testResults.test_details.map((test, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedTest(test)}
                    className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all ${
                      selectedTest === test ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getStatusIcon(test.status)}</span>
                        <div>
                          <div className="font-medium text-gray-900">{test.test_name}</div>
                          <div className="text-sm text-gray-500">
                            {formatDuration(test.duration)}
                          </div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(test.status)}`}>
                        {test.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Detail Panel */}
            <div className="lg:col-span-1">
              <h3 className="text-lg font-semibold mb-4">Test Details</h3>
              {selectedTest ? (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="mb-3">
                    <div className="font-medium text-gray-900">{selectedTest.test_name}</div>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getStatusColor(selectedTest.status)}`}>
                      {selectedTest.status.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Duration:</span> {formatDuration(selectedTest.duration)}
                    </div>
                    
                    {selectedTest.error_message && (
                      <div>
                        <span className="font-medium">Error:</span>
                        <div className="bg-red-50 border border-red-200 rounded p-2 mt-1 text-red-700 text-xs overflow-auto max-h-32">
                          {selectedTest.error_message}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                  Select a test to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* Initial State */}
        {!testResults && !loading && !error && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🧪</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Test</h3>
            <p className="text-gray-600 mb-6">
              Run comprehensive tests to verify all application features are working correctly.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-sm text-gray-600">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="font-medium text-blue-900">Backend Tests</div>
                <div>API endpoints, validation, security</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="font-medium text-green-900">Performance Tests</div>
                <div>Response times, load handling</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="font-medium text-purple-900">Security Tests</div>
                <div>XSS protection, data validation</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestResultsModal; 