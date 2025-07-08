import axios from 'axios';
import { expect } from 'chai';

const BASE_URL = 'https://consignment-api-caua3ttntq-uc.a.run.app';
const ADMIN_ENDPOINT = '/api/admin/items';
const USER_ENDPOINT = '/api/items';
const RESOURCE_ENDPOINT = '/api/items/';
const AUTH_ENDPOINT = '/api/auth/';
const USER_PROFILE_ENDPOINT = '/api/user/profile';

// Test tokens (fill in with real tokens)
const USER_TOKEN = 'FIREBASE_USER_ID_TOKEN';
const ADMIN_TOKEN = 'FIREBASE_ADMIN_ID_TOKEN';
const EXPIRED_TOKEN = 'EXPIRED_FIREBASE_TOKEN';
const MALFORMED_TOKEN = 'malformed.token.here';

// Helper function for API requests
const apiRequest = (method, url, data, token, customHeaders = {}) =>
  axios({
    method,
    url: BASE_URL + url,
    data,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    },
    validateStatus: () => true,
    timeout: 10000,
  });

describe('Comprehensive API Security Tests', () => {
  describe('Authentication & Authorization', () => {
    test('should reject requests without auth token', async () => {
      const res = await apiRequest('get', USER_ENDPOINT);
      expect([401, 403]).toContain(res.status);
    });

    test('should reject malformed auth tokens', async () => {
      const res = await apiRequest('get', USER_ENDPOINT, null, MALFORMED_TOKEN);
      expect([401, 403]).toContain(res.status);
    });

    test('should reject expired tokens', async () => {
      const res = await apiRequest('get', USER_ENDPOINT, null, EXPIRED_TOKEN);
      expect([401, 403]).toContain(res.status);
    });

    test('should reject user access to admin endpoints', async () => {
      const res = await apiRequest('get', ADMIN_ENDPOINT, null, USER_TOKEN);
      expect([401, 403]).toContain(res.status);
    });

    test('should allow admin access to admin endpoints', async () => {
      const res = await apiRequest('get', ADMIN_ENDPOINT, null, ADMIN_TOKEN);
      expect([200, 201, 204]).toContain(res.status);
    });

    test('should not expose sensitive information in error responses', async () => {
      const res = await apiRequest('get', ADMIN_ENDPOINT, null, MALFORMED_TOKEN);
      expect(res.data).not.toContain('admin');
      expect(res.data).not.toContain('password');
      expect(res.data).not.toContain('token');
    });
  });

  describe('Input Validation & Sanitization', () => {
    test('should reject SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "admin'--",
        "1' UNION SELECT * FROM users--",
      ];

      for (const payload of sqlInjectionPayloads) {
        const res = await apiRequest('post', USER_ENDPOINT, {
          title: payload,
          description: payload,
        }, USER_TOKEN);
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should reject XSS payloads', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert("XSS")',
        '<svg onload=alert(1)>',
        '"><script>alert("XSS")</script>',
        '"><img src=x onerror=alert(1)>',
        '"><iframe src="javascript:alert(1)"></iframe>',
      ];

      for (const payload of xssPayloads) {
        const res = await apiRequest('post', USER_ENDPOINT, {
          title: payload,
          description: payload,
        }, USER_TOKEN);
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should reject path traversal attempts', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const payload of pathTraversalPayloads) {
        const res = await apiRequest('get', `/api/files/${payload}`, null, USER_TOKEN);
        expect([400, 403, 404]).toContain(res.status);
      }
    });

    test('should reject oversized payloads', async () => {
      const oversizedPayloads = [
        { title: 'A'.repeat(1000000) }, // 1MB string
        { description: 'B'.repeat(5000000) }, // 5MB string
        { data: Buffer.alloc(10000000) }, // 10MB buffer
      ];

      for (const payload of oversizedPayloads) {
        const res = await apiRequest('post', USER_ENDPOINT, payload, USER_TOKEN);
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should reject malformed JSON', async () => {
      const malformedPayloads = [
        '{ invalid json }',
        '{"title": "test",}',
        '{"title": "test" "description": "test"}',
        '{"title": "test", "description": "test",}',
      ];

      for (const payload of malformedPayloads) {
        const res = await axios({
          method: 'post',
          url: BASE_URL + USER_ENDPOINT,
          data: payload,
          headers: { 
            Authorization: `Bearer ${USER_TOKEN}`,
            'Content-Type': 'application/json'
          },
          validateStatus: () => true,
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should reject invalid data types', async () => {
      const invalidTypePayloads = [
        { price: 'not_a_number' },
        { price: -100 },
        { price: 0 },
        { status: 123 },
        { createdAt: 'invalid_date' },
      ];

      for (const payload of invalidTypePayloads) {
        const res = await apiRequest('post', USER_ENDPOINT, payload, USER_TOKEN);
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('HTTP Method & Header Security', () => {
    test('should reject unsupported HTTP methods', async () => {
      const unsupportedMethods = ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
      
      for (const method of unsupportedMethods) {
        const res = await apiRequest(method, USER_ENDPOINT, null, USER_TOKEN);
        expect([405, 400, 403]).toContain(res.status);
      }
    });

    test('should reject malicious headers', async () => {
      const maliciousHeaders = {
        'X-Forwarded-For': '127.0.0.1',
        'X-Real-IP': '127.0.0.1',
        'X-Forwarded-Host': 'malicious.com',
        'X-Original-URL': '/admin',
        'X-Rewrite-URL': '/admin',
      };

      for (const [header, value] of Object.entries(maliciousHeaders)) {
        const res = await apiRequest('get', USER_ENDPOINT, null, USER_TOKEN, {
          [header]: value
        });
        expect([400, 403, 404]).toContain(res.status);
      }
    });

    test('should reject content-type attacks', async () => {
      const res = await axios({
        method: 'post',
        url: BASE_URL + USER_ENDPOINT,
        data: '{"title": "test"}',
        headers: {
          Authorization: `Bearer ${USER_TOKEN}`,
          'Content-Type': 'text/html'
        },
        validateStatus: () => true,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('IDOR & Access Control', () => {
    test('should prevent access to other users resources', async () => {
      const otherUserIds = ['user123', 'admin456', 'test789', 'hacker000'];
      
      for (const userId of otherUserIds) {
        const res = await apiRequest('get', `/api/user/${userId}/profile`, null, USER_TOKEN);
        expect([401, 403, 404]).toContain(res.status);
      }
    });

    test('should prevent modification of other users resources', async () => {
      const otherUserIds = ['user123', 'admin456', 'test789'];
      
      for (const userId of otherUserIds) {
        const res = await apiRequest('post', `/api/user/${userId}/profile`, {
          name: 'Hacked User'
        }, USER_TOKEN);
        expect([401, 403, 404]).toContain(res.status);
      }
    });

    test('should prevent access to admin-only resources', async () => {
      const adminResources = [
        '/api/admin/users',
        '/api/admin/settings',
        '/api/admin/logs',
        '/api/admin/analytics'
      ];

      for (const resource of adminResources) {
        const res = await apiRequest('get', resource, null, USER_TOKEN);
        expect([401, 403, 404]).toContain(res.status);
      }
    });
  });

  describe('Rate Limiting & DoS Protection', () => {
    test('should enforce rate limiting on auth endpoints', async () => {
      const requests = [];
      for (let i = 0; i < 50; i++) {
        requests.push(apiRequest('post', AUTH_ENDPOINT + 'login', {
          email: 'test@example.com',
          password: 'password123'
        }));
      }
      
      const results = await Promise.all(requests);
      const rateLimited = results.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });

    test('should enforce rate limiting on sensitive endpoints', async () => {
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(apiRequest('get', USER_ENDPOINT, null, USER_TOKEN));
      }
      
      const results = await Promise.all(requests);
      const rateLimited = results.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });

    test('should handle concurrent requests properly', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(apiRequest('get', USER_ENDPOINT, null, USER_TOKEN));
      }
      
      const results = await Promise.all(requests);
      const allSuccessful = results.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
    });
  });

  describe('Error Handling & Information Disclosure', () => {
    test('should not expose internal server errors', async () => {
      const res = await apiRequest('get', '/api/nonexistent', null, USER_TOKEN);
      expect(res.status).not.toBe(500);
      expect(res.data).not.toContain('stack trace');
      expect(res.data).not.toContain('error details');
    });

    test('should not expose sensitive headers', async () => {
      const res = await apiRequest('get', USER_ENDPOINT, null, USER_TOKEN);
      expect(res.headers).not.toHaveProperty('server');
      expect(res.headers).not.toHaveProperty('x-powered-by');
      expect(res.headers).not.toHaveProperty('x-aspnet-version');
    });

    test('should return consistent error formats', async () => {
      const res = await apiRequest('get', '/api/nonexistent', null, USER_TOKEN);
      expect(res.data).toHaveProperty('error');
      expect(res.data).toHaveProperty('message');
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.message).toBe('string');
    });
  });

  describe('Business Logic Security', () => {
    test('should prevent negative prices', async () => {
      const res = await apiRequest('post', USER_ENDPOINT, {
        title: 'Test Item',
        price: -50
      }, USER_TOKEN);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should prevent excessive prices', async () => {
      const res = await apiRequest('post', USER_ENDPOINT, {
        title: 'Test Item',
        price: 999999999
      }, USER_TOKEN);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should validate required fields', async () => {
      const res = await apiRequest('post', USER_ENDPOINT, {
        // Missing required fields
      }, USER_TOKEN);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should prevent duplicate resource creation', async () => {
      const itemData = {
        title: 'Duplicate Test Item',
        price: 100
      };

      // Create first item
      const res1 = await apiRequest('post', USER_ENDPOINT, itemData, USER_TOKEN);
      expect([200, 201]).toContain(res1.status);

      // Try to create duplicate
      const res2 = await apiRequest('post', USER_ENDPOINT, itemData, USER_TOKEN);
      expect([400, 409]).toContain(res2.status);
    });
  });
}); 