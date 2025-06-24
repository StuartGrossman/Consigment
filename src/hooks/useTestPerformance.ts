import { useState, useEffect, useCallback } from 'react';
import TestPerformanceService, { TestPerformanceRun, FeatureTestResult } from '../services/testPerformanceService';
import { useAuth } from './useAuth';

interface UseTestPerformanceReturn {
  testRuns: TestPerformanceRun[];
  automaticRuns: TestPerformanceRun[];
  manualRuns: TestPerformanceRun[];
  statistics: {
    totalRuns: number;
    automaticRuns: number;
    manualRuns: number;
    averagePassRate: number;
    lastRunDate: Date | null;
    criticalFeatureStability: number;
  };
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  saveTestRun: (testRun: Omit<TestPerformanceRun, 'id'>) => Promise<string>;
  startAutomaticTesting: (testRunner: () => Promise<TestPerformanceRun>) => void;
  stopAutomaticTesting: () => void;
  isAutomaticTestingEnabled: boolean;
}

export const useTestPerformance = (): UseTestPerformanceReturn => {
  const [testRuns, setTestRuns] = useState<TestPerformanceRun[]>([]);
  const [automaticRuns, setAutomaticRuns] = useState<TestPerformanceRun[]>([]);
  const [manualRuns, setManualRuns] = useState<TestPerformanceRun[]>([]);
  const [statistics, setStatistics] = useState({
    totalRuns: 0,
    automaticRuns: 0,
    manualRuns: 0,
    averagePassRate: 0,
    lastRunDate: null as Date | null,
    criticalFeatureStability: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutomaticTestingEnabled, setIsAutomaticTestingEnabled] = useState(false);

  const { isAdmin, user } = useAuth();
  const testService = TestPerformanceService.getInstance();

  const refreshData = useCallback(async () => {
    // Only fetch data if user is admin
    if (!isAdmin || !user) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [allRuns, autoRuns, manualRunsData, stats] = await Promise.all([
        testService.getTestRuns(50),
        testService.getTestRunsByType('automatic', 20),
        testService.getTestRunsByType('manual', 20),
        testService.getTestStatistics()
      ]);

      setTestRuns(allRuns);
      setAutomaticRuns(autoRuns);
      setManualRuns(manualRunsData);
      setStatistics(stats);
      setIsAutomaticTestingEnabled(testService.isAutomaticTestingEnabled());
    } catch (err: any) {
      // Only show errors that are not permission-related
      if (!(err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions'))) {
        setError(err instanceof Error ? err.message : 'Failed to fetch test performance data');
        console.error('Error fetching test performance data:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [testService, isAdmin, user]);

  const saveTestRun = useCallback(async (testRun: Omit<TestPerformanceRun, 'id'>): Promise<string> => {
    if (!isAdmin) {
      throw new Error('Admin privileges required');
    }

    try {
      const id = await testService.saveTestRun(testRun);
      // Refresh data after saving
      await refreshData();
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save test run');
      throw err;
    }
  }, [testService, refreshData, isAdmin]);

  const startAutomaticTesting = useCallback((testRunner: () => Promise<TestPerformanceRun>) => {
    if (!isAdmin) return;
    testService.startAutomaticTesting(testRunner);
    setIsAutomaticTestingEnabled(true);
  }, [testService, isAdmin]);

  const stopAutomaticTesting = useCallback(() => {
    if (!isAdmin) return;
    testService.stopAutomaticTesting();
    setIsAutomaticTestingEnabled(false);
  }, [testService, isAdmin]);

  // Initial data load - only when user becomes admin
  useEffect(() => {
    if (isAdmin && user) {
      refreshData();
    }
  }, [refreshData, isAdmin, user]);

  return {
    testRuns,
    automaticRuns,
    manualRuns,
    statistics,
    loading,
    error,
    refreshData,
    saveTestRun,
    startAutomaticTesting,
    stopAutomaticTesting,
    isAutomaticTestingEnabled
  };
}; 