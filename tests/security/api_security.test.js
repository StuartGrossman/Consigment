const axios = require('axios');

const BASE_URL = 'https://consignment-api-caua3ttntq-uc.a.run.app'; // Your Cloud Run API
const ADMIN_ENDPOINT = '/api/admin/items'; // Example admin endpoint
const USER_ENDPOINT = '/api/items'; // Example user endpoint
const RESOURCE_ENDPOINT = '/api/items/'; // For IDOR tests

// Fill in with a valid Firebase Auth token for a regular user and an admin
const USER_TOKEN = 'FIREBASE_USER_ID_TOKEN';
const ADMIN_TOKEN = 'FIREBASE_ADMIN_ID_TOKEN';

// Helper to send requests with/without auth
const apiRequest = (method, url, data, token) =>
  axios({
    method,
    url: BASE_URL + url,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true,
  });

describe('API Security Tests', () => {
  test('should reject unauthorized access to admin endpoint', async () => {
    const res = await apiRequest('get', ADMIN_ENDPOINT);
    expect([401, 403]).toContain(res.status);
  });

  test('should reject user token on admin endpoint', async () => {
    const res = await apiRequest('get', ADMIN_ENDPOINT, null, USER_TOKEN);
    expect([401, 403]).toContain(res.status);
  });

  test('should reject malformed payload', async () => {
    const res = await apiRequest('post', USER_ENDPOINT, { nonsense: 'bad' }, USER_TOKEN);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('should reject oversized payload', async () => {
    const bigString = 'A'.repeat(1000000); // 1MB
    const res = await apiRequest('post', USER_ENDPOINT, { title: bigString }, USER_TOKEN);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('should not allow XSS in item title', async () => {
    const res = await apiRequest('post', USER_ENDPOINT, {
      title: '<img src=x onerror=alert(1)>',
      // ...other required fields (fill in as needed)
    }, USER_TOKEN);
    expect(res.status).toBeGreaterThanOrEqual(400);
    // Optionally, fetch the item and check that the title is sanitized
  });

  test('should not allow IDOR (accessing another user\'s item)', async () => {
    // Replace with a real or guessed item ID that should not belong to the user
    const targetId = 'SOMEONE_ELSES_ITEM_ID';
    const res = await apiRequest('get', RESOURCE_ENDPOINT + targetId, null, USER_TOKEN);
    expect([401, 403, 404]).toContain(res.status);
  });

  test('should reject wrong HTTP method', async () => {
    const res = await apiRequest('put', USER_ENDPOINT, { title: 'test' }, USER_TOKEN); // If only POST is allowed
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('should enforce rate limiting', async () => {
    const requests = [];
    for (let i = 0; i < 20; i++) {
      requests.push(apiRequest('get', USER_ENDPOINT, null, USER_TOKEN));
    }
    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });
}); 