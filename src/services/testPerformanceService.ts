import { db } from '../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';

export interface TestResult {
  success: boolean;
  message: string;
  duration: number;
  details?: any;
}

export interface FeatureTestResult {
  featureId: string;
  featureName: string;
  category: string;
  priority: string;
  result: TestResult;
  timestamp: Date;
}

export interface TestPerformanceRun {
  id?: string;
  runId: string;
  timestamp: Date;
  type: 'manual' | 'automatic';
  triggeredBy?: string; // user ID for manual runs
  totalFeatures: number;
  passedFeatures: number;
  failedFeatures: number;
  duration: number;
  results: FeatureTestResult[];
  summary: {
    passRate: number;
    criticalPassed: number;
    criticalTotal: number;
    highPassed: number;
    highTotal: number;
    mediumPassed: number;
    mediumTotal: number;
    lowPassed: number;
    lowTotal: number;
  };
}

class TestPerformanceService {
  private static instance: TestPerformanceService;
  private autoTestInterval: NodeJS.Timeout | null = null;
  private isAutoTestingEnabled = false;

  static getInstance(): TestPerformanceService {
    if (!TestPerformanceService.instance) {
      TestPerformanceService.instance = new TestPerformanceService();
    }
    return TestPerformanceService.instance;
  }

  // Save test performance run to Firebase
  async saveTestRun(testRun: Omit<TestPerformanceRun, 'id'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'test_performance_runs'), {
        ...testRun,
        timestamp: Timestamp.fromDate(testRun.timestamp),
        results: testRun.results.map(result => ({
          ...result,
          timestamp: Timestamp.fromDate(result.timestamp)
        }))
      });
      console.log('Test run saved with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('Error saving test run:', error);
      throw error;
    }
  }

  // Get all test performance runs
  async getTestRuns(limitCount: number = 50): Promise<TestPerformanceRun[]> {
    try {
      const q = query(
        collection(db, 'test_performance_runs'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate(),
          results: data.results.map((result: any) => ({
            ...result,
            timestamp: result.timestamp.toDate()
          }))
        } as TestPerformanceRun;
      });
    } catch (error) {
      console.error('Error fetching test runs:', error);
      return [];
    }
  }

  // Get test runs by type
  async getTestRunsByType(type: 'manual' | 'automatic', limitCount: number = 20): Promise<TestPerformanceRun[]> {
    try {
      const q = query(
        collection(db, 'test_performance_runs'),
        where('type', '==', type),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate(),
          results: data.results.map((result: any) => ({
            ...result,
            timestamp: result.timestamp.toDate()
          }))
        } as TestPerformanceRun;
      });
    } catch (error) {
      console.error('Error fetching test runs by type:', error);
      return [];
    }
  }

  // Get test performance statistics
  async getTestStatistics(): Promise<{
    totalRuns: number;
    automaticRuns: number;
    manualRuns: number;
    averagePassRate: number;
    lastRunDate: Date | null;
    criticalFeatureStability: number;
  }> {
    try {
      const runs = await this.getTestRuns(100);
      
      if (runs.length === 0) {
        return {
          totalRuns: 0,
          automaticRuns: 0,
          manualRuns: 0,
          averagePassRate: 0,
          lastRunDate: null,
          criticalFeatureStability: 0
        };
      }

      const automaticRuns = runs.filter(run => run.type === 'automatic').length;
      const manualRuns = runs.filter(run => run.type === 'manual').length;
      const averagePassRate = runs.reduce((sum, run) => sum + run.summary.passRate, 0) / runs.length;
      const lastRunDate = runs[0].timestamp;
      
      // Calculate critical feature stability (average pass rate for critical features)
      const criticalStabilityRates = runs.map(run => 
        run.summary.criticalTotal > 0 ? (run.summary.criticalPassed / run.summary.criticalTotal) * 100 : 100
      );
      const criticalFeatureStability = criticalStabilityRates.reduce((sum, rate) => sum + rate, 0) / criticalStabilityRates.length;

      return {
        totalRuns: runs.length,
        automaticRuns,
        manualRuns,
        averagePassRate,
        lastRunDate,
        criticalFeatureStability
      };
    } catch (error) {
      console.error('Error calculating test statistics:', error);
      return {
        totalRuns: 0,
        automaticRuns: 0,
        manualRuns: 0,
        averagePassRate: 0,
        lastRunDate: null,
        criticalFeatureStability: 0
      };
    }
  }

  // Start automatic testing (every 24 hours)
  startAutomaticTesting(testRunner: () => Promise<TestPerformanceRun>) {
    if (this.isAutoTestingEnabled) {
      console.log('Automatic testing is already enabled');
      return;
    }

    this.isAutoTestingEnabled = true;
    console.log('Starting automatic testing service (24-hour interval)');

    // Run initial test after 1 minute (for demo purposes)
    setTimeout(async () => {
      console.log('Running initial automatic test...');
      try {
        const testRun = await testRunner();
        await this.saveTestRun({
          ...testRun,
          type: 'automatic'
        });
        console.log('Initial automatic test completed and saved');
      } catch (error) {
        console.error('Error running initial automatic test:', error);
      }
    }, 60000); // 1 minute

    // Set up 24-hour interval
    this.autoTestInterval = setInterval(async () => {
      console.log('Running scheduled automatic test...');
      try {
        const testRun = await testRunner();
        await this.saveTestRun({
          ...testRun,
          type: 'automatic'
        });
        console.log('Automatic test completed and saved');
      } catch (error) {
        console.error('Error running automatic test:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  // Stop automatic testing
  stopAutomaticTesting() {
    if (this.autoTestInterval) {
      clearInterval(this.autoTestInterval);
      this.autoTestInterval = null;
    }
    this.isAutoTestingEnabled = false;
    console.log('Automatic testing service stopped');
  }

  // Check if automatic testing is enabled
  isAutomaticTestingEnabled(): boolean {
    return this.isAutoTestingEnabled;
  }

  // Generate a unique run ID
  generateRunId(): string {
    return `test-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default TestPerformanceService; 