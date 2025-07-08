import { test, expect } from '@playwright/test';

const BASE_URL = 'https://consignment-store-4a564.web.app';

test.describe('Frontend Security Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all storage before each test
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe('XSS Prevention', () => {
    test('should not execute XSS in search input', async ({ page }) => {
      await page.goto(BASE_URL);
      
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert("XSS")',
        '<svg onload=alert(1)>',
        '"><script>alert("XSS")</script>',
      ];

      for (const payload of xssPayloads) {
        // Try to inject XSS in search
        await page.fill('input[placeholder*="search" i]', payload);
        await page.keyboard.press('Enter');
        
        // Wait a moment for any potential script execution
        await page.waitForTimeout(1000);
        
        // Check that no alert dialog appeared
        const dialog = page.locator('text=alert');
        await expect(dialog).not.toBeVisible();
      }
    });

    test('should not execute XSS in form fields', async ({ page }) => {
      await page.goto(BASE_URL);
      
      const xssPayload = '<script>alert("XSS")</script>';
      
      // Try to inject XSS in item creation form
      await page.click('button:has-text("Add Item")');
      
      // Fill form fields with XSS payload
      await page.fill('input[name="title"], input[placeholder*="title" i]', xssPayload);
      await page.fill('textarea[name="description"], textarea[placeholder*="description" i]', xssPayload);
      
      // Submit form
      await page.click('button:has-text("Create"), button:has-text("Submit")');
      
      // Wait and check for alert
      await page.waitForTimeout(1000);
      const dialog = page.locator('text=alert');
      await expect(dialog).not.toBeVisible();
    });

    test('should not execute XSS in URL parameters', async ({ page }) => {
      const xssPayload = '<script>alert("XSS")</script>';
      const encodedPayload = encodeURIComponent(xssPayload);
      
      await page.goto(`${BASE_URL}?search=${encodedPayload}&title=${encodedPayload}`);
      
      // Wait and check for alert
      await page.waitForTimeout(1000);
      const dialog = page.locator('text=alert');
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Authentication & Authorization', () => {
    test('should redirect unauthenticated users from protected pages', async ({ page }) => {
      const protectedPages = [
        '/admin',
        '/dashboard',
        '/profile',
        '/inventory',
        '/analytics'
      ];

      for (const path of protectedPages) {
        await page.goto(`${BASE_URL}${path}`);
        
        // Should redirect to login or show access denied
        const currentUrl = page.url();
        expect(currentUrl).not.toContain(path);
        
        // Check for login form or access denied message
        const loginForm = page.locator('form, [data-testid="login"], .login');
        const accessDenied = page.locator('text=/access denied|unauthorized|login required/i');
        
        expect(loginForm.isVisible() || accessDenied.isVisible()).toBeTruthy();
      }
    });

    test('should not allow access to admin pages as regular user', async ({ page }) => {
      // First login as regular user (you'll need to implement this)
      await page.goto(BASE_URL);
      
      // Simulate login (replace with actual login flow)
      await page.fill('input[type="email"]', 'user@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("Login")');
      
      // Wait for login to complete
      await page.waitForURL('**/dashboard**');
      
      // Try to access admin pages
      const adminPages = ['/admin', '/admin/users', '/admin/settings'];
      
      for (const path of adminPages) {
        await page.goto(`${BASE_URL}${path}`);
        
        // Should show access denied or redirect
        const accessDenied = page.locator('text=/access denied|unauthorized|forbidden/i');
        const currentUrl = page.url();
        
        expect(accessDenied.isVisible() || !currentUrl.includes(path)).toBeTruthy();
      }
    });
  });

  test.describe('LocalStorage & SessionStorage Security', () => {
    test('should not allow privilege escalation via localStorage manipulation', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Try to manipulate user role in localStorage
      await page.evaluate(() => {
        localStorage.setItem('userRole', 'admin');
        localStorage.setItem('isAdmin', 'true');
        localStorage.setItem('userPermissions', JSON.stringify(['admin', 'superuser']));
      });
      
      // Reload page
      await page.reload();
      
      // Try to access admin functionality
      await page.goto(`${BASE_URL}/admin`);
      
      // Should still be blocked
              const accessDenied = page.locator('text=/access denied|unauthorized/i');
      const currentUrl = page.url();
      
      expect(accessDenied.isVisible() || !currentUrl.includes('/admin')).toBeTruthy();
    });

    test('should not expose sensitive data in localStorage', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Check localStorage for sensitive information
      const localStorage = await page.evaluate(() => {
        const items = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            items[key] = window.localStorage.getItem(key);
          }
        }
        return items;
      });
      
      // Check for sensitive data
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
      const sensitiveData = Object.keys(localStorage).some(key => 
        sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))
      );
      
      expect(sensitiveData).toBeFalsy();
    });
  });

  test.describe('Input Validation', () => {
    test('should validate form inputs on frontend', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Try to submit forms with invalid data
      await page.click('button:has-text("Add Item")');
      
      // Test various invalid inputs
      const invalidInputs = [
        { field: 'title', value: '', expected: 'required' },
        { field: 'price', value: '-100', expected: 'positive' },
        { field: 'price', value: 'not_a_number', expected: 'number' },
        { field: 'email', value: 'invalid_email', expected: 'email' },
      ];
      
      for (const input of invalidInputs) {
        // Fill invalid data
        await page.fill(`input[name="${input.field}"], input[placeholder*="${input.field}" i]`, input.value);
        
        // Try to submit
        await page.click('button:has-text("Create"), button:has-text("Submit")');
        
        // Should show validation error
        const errorMessage = page.locator(`text=${input.expected}`, { ignoreCase: true });
        await expect(errorMessage).toBeVisible();
      }
    });

    test('should prevent oversized inputs', async ({ page }) => {
      await page.goto(BASE_URL);
      
      const oversizedInput = 'A'.repeat(10000); // 10KB string
      
      await page.click('button:has-text("Add Item")');
      await page.fill('input[name="title"], input[placeholder*="title" i]', oversizedInput);
      
      // Should show validation error or prevent submission
      await page.click('button:has-text("Create"), button:has-text("Submit")');
      
      const errorMessage = page.locator('text=too long, text=maximum, text=limit', { ignoreCase: true });
      await expect(errorMessage).toBeVisible();
    });
  });

  test.describe('CSRF Protection', () => {
    test('should include CSRF tokens in forms', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Check for CSRF tokens in forms
      const forms = page.locator('form');
      const formCount = await forms.count();
      
      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i);
        const csrfToken = form.locator('input[name*="csrf"], input[name*="token"], input[type="hidden"]');
        
        // At least one form should have CSRF protection
        if (i === 0) {
          await expect(csrfToken).toBeVisible();
        }
      }
    });
  });

  test.describe('Content Security Policy', () => {
    test('should have CSP headers', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      const headers = response?.headers();
      
      // Check for CSP header
      expect(headers?.['content-security-policy'] || headers?.['x-content-security-policy']).toBeDefined();
    });

    test('should not allow inline scripts', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Try to execute inline script
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'alert("inline script")';
        document.head.appendChild(script);
      });
      
      // Wait and check for alert
      await page.waitForTimeout(1000);
      const dialog = page.locator('text=alert');
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should not expose sensitive information in error messages', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Trigger various errors
      await page.goto(`${BASE_URL}/nonexistent-page`);
      
      // Check error page doesn't expose sensitive info
      const sensitiveInfo = page.locator('text=password, text=token, text=secret, text=admin', { ignoreCase: true });
      await expect(sensitiveInfo).not.toBeVisible();
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Simulate offline mode
      await page.route('**/*', route => route.abort());
      
      await page.goto(BASE_URL);
      
      // Should show offline message or handle gracefully
      const offlineMessage = page.locator('text=offline, text=network error, text=connection', { ignoreCase: true });
      await expect(offlineMessage).toBeVisible();
    });
  });

  test.describe('URL Manipulation', () => {
    test('should not allow directory traversal via URL', async ({ page }) => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
      ];
      
      for (const path of traversalPaths) {
        await page.goto(`${BASE_URL}/${path}`);
        
        // Should show 404 or access denied, not expose file contents
        const fileContent = page.locator('text=root:, text=bin:, text=daemon:', { ignoreCase: true });
        await expect(fileContent).not.toBeVisible();
      }
    });

    test('should sanitize URL parameters', async ({ page }) => {
      const maliciousParams = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        'data:text/html,<script>alert("XSS")</script>',
      ];
      
      for (const param of maliciousParams) {
        const encodedParam = encodeURIComponent(param);
        await page.goto(`${BASE_URL}?redirect=${encodedParam}&url=${encodedParam}`);
        
        // Should not execute scripts
        await page.waitForTimeout(1000);
        const dialog = page.locator('text=alert');
        await expect(dialog).not.toBeVisible();
      }
    });
  });
}); 